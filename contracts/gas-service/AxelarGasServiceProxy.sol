// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { InitProxy } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/upgradable/InitProxy.sol';

contract AxelarGasServiceProxy is InitProxy {
    function contractId() internal pure override returns (bytes32) {
        return keccak256('axelar-gas-service');
    }
}
