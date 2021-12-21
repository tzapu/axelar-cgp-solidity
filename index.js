'use strict';

const url = 'https://ropsten.infura.io/v3/2be110f3450b494f8d637ed7bb6954e3';

const { readFile } = require('fs');
const { promisify } = require('util');

const { parse } = require('csv-parse');
const {
  providers: { JsonRpcProvider },
  utils: {
    defaultAbiCoder,
    recoverAddress,
    hashMessage,
    arrayify,
    keccak256,
    Interface,
  },
} = require('ethers');
const { merge } = require('lodash');
const { map, get, tail, omit, filter } = require('lodash/fp');
const {
  abi: IAxelarGatewayMultisigABI,
} = require('./build/IAxelarGatewayMultisig.json');
const {
  abi: BurnableMintableCappedERC20ABI,
} = require('./build/BurnableMintableCappedERC20.json');
const iface = new Interface(
  IAxelarGatewayMultisigABI.concat(BurnableMintableCappedERC20ABI),
);
const provider = new JsonRpcProvider(url);

const readFileAsync = promisify(readFile);
const parseAsync = promisify(parse);

const EXECUTE_METHOD_ID = '0x09c5eabe';

const getCalldata = (data) => `0x${data.substring(10)}`;

const methodDecoders = {
  deployToken(calldata) {
    const [name, symbol, decimals, cap] = defaultAbiCoder.decode(
      ['string', 'string', 'uint8', 'uint256'],
      calldata,
    );

    return { name, symbol, decimals, cap: cap.toString() };
  },
  mintToken(calldata) {
    const [symbol, account, amount] = defaultAbiCoder.decode(
      ['string', 'address', 'uint256'],
      calldata,
    );

    return { symbol, account, amount: amount.toString() };
  },
  burnToken(calldata) {
    const [symbol, salt] = defaultAbiCoder.decode(
      ['string', 'bytes32'],
      calldata,
    );

    return { symbol, salt };
  },
  transferOwnership(calldata) {
    const [newOwners, newThreshold] = defaultAbiCoder.decode(
      ['address[], uint256'],
      calldata,
    );

    return { newOwners, newThreshold };
  },
  transferOperatorship(calldata) {
    const [newOperators, newThreshold] = defaultAbiCoder.decode(
      ['address[], uint256'],
      calldata,
    );

    return { newOperators, newThreshold };
  },
};

readFileAsync('./transactions.csv')
  .then((fileData) => parseAsync(fileData, { columns: true, trim: true }))
  .then(map(get('Txhash')))
  .then(tail)
  .then((txHashes) =>
    Promise.all(
      txHashes.map((txHash) =>
        Promise.all([
          provider.getTransaction(txHash),
          provider.getTransactionReceipt(txHash),
        ]).then(([tx, txReceipt]) => merge(tx, txReceipt)),
      ),
    ),
  )
  .then(filter(({ data }) => data && data.startsWith(EXECUTE_METHOD_ID)))
  .then((txs) =>
    txs.map(({ blockNumber, hash: txHash, data, status, logs }) => {
      try {
        const [input] = defaultAbiCoder.decode(['bytes'], getCalldata(data));
        const [commandData, signatures] = defaultAbiCoder.decode(
          ['bytes', 'bytes[]'],
          input,
        );
        const signers = signatures.map((signature) =>
          recoverAddress(
            hashMessage(arrayify(keccak256(arrayify(commandData)))),
            signature,
          ),
        );

        const [chainId, commandIds, commands, methodCalldatas] =
          defaultAbiCoder.decode(
            ['uint256', 'bytes32[]', 'string[]', 'bytes[]'],
            commandData,
          );

        return {
          blockNumber,
          txHash,
          signers,
          successful: status === 1,
          chainId: chainId.toString(),
          commands: commandIds.map((commandId, i) => ({
            id: commandId,
            command: commands[i],
            params: methodDecoders[commands[i]](methodCalldatas[i]),
          })),
          events: logs
            .map((log) => iface.parseLog(log))
            .map(omit(['eventFragment', 'topic'])),
        };
      } catch (err) {
        console.error(
          `failed decoding transaction ${txHash} with error: ${err}`,
        );

        return null;
      }
    }),
  )
  .then(filter(Boolean))
  .then((result) => JSON.stringify(result, null, '  '))
  .then(console.log)
  .catch(console.error);
