'use strict';

require('dotenv').config();

const [, , id] = process.argv;

const prefix = process.env.PREFIX;
const chain = process.env.CHAIN;
const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;

const childProcess = require('child_process');
const { promisify } = require('util');
const {
    Wallet,
    providers: { JsonRpcProvider },
} = require('ethers');
const { get } = require('lodash/fp');

const exec = promisify(childProcess.exec);

const getGatewayAddress = () =>
    exec(`${prefix} "axelard q evm gateway-address ${chain} --output json"`).then(get('stdout')).then(JSON.parse).then(get('address'));

const getExecuteData = (id) =>
    exec(`${prefix} "axelard q evm batched-commands ${chain} ${id} --output json"`)
        .then(get('stdout'))
        .then(JSON.parse)
        .then(get('execute_data'));

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);

Promise.all([getGatewayAddress(), getExecuteData(id)])
    .then(([gatewayAddress, data]) => wallet.sendTransaction({ to: gatewayAddress, data: `0x${data}`, gasLimit: 5000000 }))
    .then((tx) => {
        console.log(`sent transaction ${tx.hash}`);

        return tx.wait();
    })
    .then(console.log)
    .catch(console.error);
