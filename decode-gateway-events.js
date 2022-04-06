'use strict';

require('dotenv').config();

const url = process.env.URL;
const txHash =
  '0x9181188d6b8f6ba6dffc8a2a31e8120edb27b140fb8ce3b8063bcaaec9d73445';
const IAxelarGateway = require('./build/IAxelarGateway.json');

const {
  utils: { Interface },
  providers: { JsonRpcProvider },
} = require('ethers');
const { get, map, filter } = require('lodash/fp');

const provider = new JsonRpcProvider(url, 'any');
const iface = new Interface(IAxelarGateway.abi);

provider
  .getTransactionReceipt(txHash)
  .then(get('logs'))
  .then(
    filter((log) => {
      try {
        iface.parseLog(log);
        return true;
      } catch {
        return false;
      }
    }),
  )
  .then(map((log) => iface.parseLog(log)))
  .then((logs) => console.log(JSON.stringify(logs, null, '  ')))
  .catch(console.error);
