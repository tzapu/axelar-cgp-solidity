'use strict';

const {
  providers: { JsonRpcProvider },
  utils: { keccak256 },
} = require('ethers');
const { map } = require('lodash/fp');

const rpcProviders = {
  ethereum: new JsonRpcProvider(
    'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
  ),
  moonbeam: new JsonRpcProvider('https://rpc.api.moonbeam.network'),
  avalanche: new JsonRpcProvider('https://api.avax.network/ext/bc/C/rpc'),
  polygon: new JsonRpcProvider('https://polygon-rpc.com/'),
  fantom: new JsonRpcProvider('https://rpc.ftm.tools/'),
};

const tokenDeployers = {
  ethereum: '0x7A811A7525928f22a2DA97e94750b94215C73E61',
  avalanche: '0x09162c3329e8534e0E95aE37e8e7Fd47c46b8a08',
  fantom: '0x6Db51ac9fD346dcCd7aEA44031a1c259ED9f3C8F',
  polygon: '0xa2B74EE32a5Db48A2312bc2082c730CECC1241cC',
  moonbeam: '0xAD81fd12bc793Ebb4C8F11035A5cA086c0be062c',
};

const gatewayImplementations = {
  ethereum: '0x46E1F8E746ee9037fA42b3a718dcE6c36CB3f16f',
  avalanche: '0x165F0D50D35988F02592c19c15D410E5bF7bDe2f',
  fantom: '0xb52F09787f67c8e40850991C9Bd331d65AE37026',
  polygon: '0x4b4E3f79c29EdFd13EeC0a30BE982D6852eD2BDc',
  moonbeam: '0x24F8b66ef108A409d3708f4a59B8096B6f0e6E0B',
};

Promise.all(
  Object.entries(tokenDeployers).map(async ([chain, address]) => ({
    chain,
    code: await rpcProviders[chain].getCode(address),
  })),
)
  .then(map(({ chain, code }) => ({ chain, codeHash: keccak256(code) })))
  .then((tokenDeployerCodeHashes) =>
    console.log('tokenDeployerCodeHashes', tokenDeployerCodeHashes),
  )
  .then(() =>
    Promise.all(
      Object.entries(gatewayImplementations).map(async ([chain, address]) => ({
        chain,
        code: await rpcProviders[chain].getCode(address),
        codeWithoutTokenDeployer: await rpcProviders[chain]
          .getCode(address)
          .then((code) =>
            code.replaceAll(tokenDeployers[chain].slice(2).toLowerCase(), ''),
          ),
      })),
    ),
  )
  .then(
    map(({ chain, code, codeWithoutTokenDeployer }) => ({
      chain,
      codeHash: keccak256(code),
      codeHashWithoutTokenDeployer: keccak256(codeWithoutTokenDeployer),
    })),
  )
  .then((gatewayImplementationCodeHashes) =>
    console.log(
      'gatewayImplementationCodeHashes',
      gatewayImplementationCodeHashes,
    ),
  );
