'use strict';

const url = 'https://ropsten.infura.io/v3/2be110f3450b494f8d637ed7bb6954e3';
const privKey =
  '2ac844a413eb0c4185a8b6d99c71a4be44a6d808b1276384bcd38f51c799f873';

const { abi } = require('./build/IAxelarGatewayMultisig.json');
const {
  Contract,
  Wallet,
  providers: { JsonRpcProvider },
  utils: { defaultAbiCoder },
} = require('ethers');

const gatewayAddress = '0x05af73194540fA6Af1A310266F4432d67Fc91c0a';
const newImplementationAddress = '0x84bFb932Ff555281514Eb0603b6EE0fBB5a88A35';
const ownerAddresses = [
  '0x227c369e6A9e6E1364D889eC06931a058204d796',
  '0x69d132b4B348F598eB949c10F803bCAfAD9987e2',
  '0xBEb380f9F9C37e8c3DeFd884D23A2136346d9ee5',
  '0x2501d9D8AC7f4b125A2a43338307E52751E7C6bd',
  '0xEBbCAcc928658E6De98ED7cCA65A449Dc6b2C6ad',
];
const operatorAddresses = [
  '0xDFF186A3455a3A58Ee486DA00B664d197784CB91',
  '0x5dD84306C74e4645333F372910c636737adFD830',
  '0xaC19aB2c0860735205e6BD51Dfd0458Cc35CC32B',
  '0x12722bB3ed17b3fA0d72a51e23cC54C1Df4CA73a',
  '0x16CC7A2B7D7278c5563FB068B1c321629C1D5C72',
];

const provider = new JsonRpcProvider(url);
const wallet = new Wallet(privKey, provider);
const contract = new Contract(gatewayAddress, abi, wallet);

const params = defaultAbiCoder.encode(
  ['address[]', 'uint256', 'address[]', 'uint256', 'address[]', 'uint256'],
  [[wallet.address], 1, ownerAddresses, 3, operatorAddresses, 3],
);

contract
  .upgrade(newImplementationAddress, params, { gasLimit: 1000000 })
  .then(console.log)
  .catch(console.error);
