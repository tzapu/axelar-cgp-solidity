'use strict';

require('dotenv').config();

const {
  ContractFactory,
  Contract,
  Wallet,
  providers: { JsonRpcProvider },
  utils: { defaultAbiCoder, arrayify, computeAddress, keccak256 },
} = require('ethers');

const { execSync } = require('child_process');

// these environment variables should be defined in an '.env' file
const prefix = process.env.PREFIX;
const chain = process.env.CHAIN;
const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;
const adminThreshold = parseInt(process.env.ADMIN_THRESHOLD);
const adminPrivateKeys = JSON.parse(process.env.ADMIN_PRIVATE_KEYS);

const provider = new JsonRpcProvider(url);
const gatewayAddress = JSON.parse(
  execSync(`${prefix} "axelard q evm gateway-address ${chain} --output json"`),
).address;
const wallet = new Wallet(privKey, provider);

const TokenDeployer = require('../build/TokenDeployer.json');
const AxelarGatewayMultisig = require('../build/AxelarGatewayMultisig.json');

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

const adminKeyIDs = JSON.parse(
  execSync(`${prefix} "axelard q tss external-key-id ${chain} --output json"`),
).key_ids;

const admins = adminKeyIDs.map((adminKeyID) => {
  const output = execSync(
    `${prefix} "axelard q tss key ${adminKeyID} --output json"`,
  );
  const key = JSON.parse(output).ecdsa_key.key;

  return computeAddress(`0x04${key.x}${key.y}`);
});

const getAddresses = (role) => {
  const keyID = execSync(`${prefix} "axelard q tss key-id ${chain} ${role}"`, {
    encoding: 'utf-8',
  }).replaceAll('\n', '');
  const output = execSync(
    `${prefix} "axelard q tss key ${keyID} --output json"`,
  );
  const keys = JSON.parse(output).multisig_key.key;

  const addresses = keys.map((key) => computeAddress(`0x04${key.x}${key.y}`));

  return {
    addresses,
    threshold: JSON.parse(output).multisig_key.threshold,
  };
};

const { addresses: owners, threshold: ownerThreshold } = getAddresses('master');
const { addresses: operators, threshold: operatorThreshold } =
  getAddresses('secondary');

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

tokenDeployerFactory
  .deploy()
  .then((tokenDeployer) => tokenDeployer.deployed())
  .then(({ address }) => {
    console.log(`deployed token deployer at address ${address}`);

    return axelarGatewayMultisigFactory.deploy(address);
  })
  .then((axelarGatewayMultisig) => axelarGatewayMultisig.deployed())
  .then(async (newImplementation) => {
    console.log(
      `deployed axelar gateway multisig at address ${newImplementation.address}`,
    );

    const newImplementationCodeHash = await newImplementation.provider
      .getCode(newImplementation.address)
      .then(keccak256);

    for (const adminPrivateKey of adminPrivateKeys.slice(0, adminThreshold)) {
      const contract = new Contract(
        gatewayAddress,
        AxelarGatewayMultisig.abi,
        new Wallet(adminPrivateKey, provider),
      );
      await contract
        .upgrade(newImplementation.address, newImplementationCodeHash, params)
        .then((tx) => tx.wait())
        .then(console.log);

      await contract.tokenAddresses('AXL').then((address) => {
        console.log("contract.tokenAddresses('AXL')", address);
      });
    }
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
