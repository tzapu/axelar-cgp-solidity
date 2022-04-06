'use strict';

require('dotenv').config();

const [, , data] = process.argv;

const url = process.env.URL;
const privKey = process.env.PRIVATE_KEY;
const gatewayAddress = process.env.GATEWAY_ADDRESS;

const {
  Wallet,
  providers: { StaticJsonRpcProvider },
} = require('ethers');

const provider = new StaticJsonRpcProvider(url, 'any');
const wallet = new Wallet(privKey, provider);

wallet
  .sendTransaction({ to: gatewayAddress, data: `0x${data}`, gasLimit: 5000000 })
  .then((tx) => tx.wait())
  .then(console.log)
  .catch(console.error);
