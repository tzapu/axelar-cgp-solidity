'use strict';

require('dotenv').config();

const prefix = process.env.PREFIX;
const chain = process.env.CHAIN;
const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;
const adminPrivKeys = JSON.parse(process.env.ADMIN_PRIVATE_KEYS);
const adminThreshold = parseInt(process.env.ADMIN_THRESHOLD);

const childProcess = require('child_process');
const { promisify } = require('util');
const { ethers } = require('hardhat');
const {
    getContractFactory,
    Wallet,
    providers: { JsonRpcProvider },
    utils: { defaultAbiCoder, computeAddress },
} = ethers;
const { get } = require('lodash/fp');

const exec = promisify(childProcess.exec);

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);

const getOperators = (chain) =>
    exec(`${prefix} "axelard q evm address ${chain} --output json"`).then(get('stdout')).then(JSON.parse).then(get('multisig_addresses'));

const getAuthDeployParams = ({ addresses, threshold }) => [defaultAbiCoder.encode(['address[]', 'uint256'], [addresses, threshold])];

const getGatewayDeployParams = (addresses, threshold) =>
    defaultAbiCoder.encode(['address[]', 'uint8', 'bytes'], [addresses, threshold, '0x']);

const deploy = () =>
    Promise.all([
        getContractFactory('AxelarGateway', wallet),
        getContractFactory('AxelarAuthMultisig', wallet),
        getContractFactory('TokenDeployer', wallet),
        getContractFactory('AxelarGatewayProxy', wallet),
        getOperators(chain),
    ]).then(async ([gatewayFactory, authFactory, tokenDeployerFactory, gatewayProxyFactory, operators]) => {
        const auth = await authFactory.deploy(getAuthDeployParams(operators)).then((contract) => contract.deployed());
        const tokenDeployer = await tokenDeployerFactory.deploy().then((contract) => contract.deployed());
        const gatewayImplementation = await gatewayFactory
            .deploy(auth.address, tokenDeployer.address)
            .then((contract) => contract.deployed());
        const proxy = await gatewayProxyFactory
            .deploy(gatewayImplementation.address, getGatewayDeployParams(adminPrivKeys.map(computeAddress), adminThreshold))
            .then((contract) => contract.deployed());

        await auth.transferOwnership(proxy.address, { gasLimit: 100000 }).then((tx) => tx.wait());

        return proxy.address;
    });

deploy().then(console.log).catch(console.error);
