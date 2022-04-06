'use strict';

require('dotenv').config();

const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;
const admins = JSON.parse(process.env.ADMINS);
const adminThreshold = parseInt(process.env.ADMIN_THRESHOLD);
const owners = JSON.parse(process.env.OWNERS);
const ownerThreshold = parseInt(process.env.OWNER_THRESHOLD);
const operators = JSON.parse(process.env.OPERATORS);
const operatorThreshold = parseInt(process.env.OPERATOR_THRESHOLD);

const TokenDeployer = require('./build/TokenDeployer.json');
const AxelarGatewayMultisig = require('./build/AxelarGatewayMultisig.json');
const AxelarGatewayProxy = require('./build/AxelarGatewayProxy.json');
const {
  ContractFactory,
  Wallet,
  providers: { StaticJsonRpcProvider },
  utils: { defaultAbiCoder, arrayify },
} = require('ethers');

const provider = new StaticJsonRpcProvider(url, 7546);
const wallet = new Wallet(privKey, provider);

const params = arrayify(
  defaultAbiCoder.encode(
    ['address[]', 'uint8', 'address[]', 'uint8', 'address[]', 'uint8'],
    [
      admins,
      adminThreshold,
      owners,
      ownerThreshold,
      operators,
      operatorThreshold,
    ],
  ),
);

const tokenDeployerFactory = new ContractFactory(
  TokenDeployer.abi,
  TokenDeployer.bytecode,
  wallet,
);
const axelarGatewayMultisigFactory = new ContractFactory(
  AxelarGatewayMultisig.abi,
  AxelarGatewayMultisig.bytecode,
  wallet,
);
const axelarGatewayProxyFactory = new ContractFactory(
  AxelarGatewayProxy.abi,
  AxelarGatewayProxy.bytecode,
  wallet,
);

tokenDeployerFactory
  .deploy()
  .then((tokenDeployer) => tokenDeployer.deployed())
  .then(({ address }) => axelarGatewayMultisigFactory.deploy(address))
  .then((axelarGatewayMultisig) => axelarGatewayMultisig.deployed())
  .then(({ address }) => axelarGatewayProxyFactory.deploy(address, params))
  .then((axelarGatewayProxy) => axelarGatewayProxy.deployed())
  .then(({ address }) => {
    console.log(`deployed axelar gateway at address ${address}`);

    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
