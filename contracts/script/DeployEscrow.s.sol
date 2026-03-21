// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AgentEscrow.sol";

contract DeployEscrow is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address treasury = vm.addr(deployerKey); // treasury = deployer wallet for simplicity

        vm.startBroadcast(deployerKey);

        AgentEscrow escrow = new AgentEscrow(treasury, 100); // 1% fee

        vm.stopBroadcast();

        console.log("AgentEscrow:", address(escrow));
        console.log("Treasury:", treasury);
        console.log("Fee: 1% (100 bps)");
    }
}
