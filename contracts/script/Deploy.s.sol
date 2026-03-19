// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/MockUSDT.sol";
import "../src/CreditRegistry.sol";
import "../src/LoanPool.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address agent = vm.envAddress("AGENT_ADDRESS");

        vm.startBroadcast(deployerKey);

        MockUSDT usdt = new MockUSDT();
        CreditRegistry registry = new CreditRegistry();
        LoanPool pool = new LoanPool(address(usdt), address(registry), agent);

        // Authorize pool to update credit scores
        registry.setAuthorizedUpdater(address(pool), true);
        registry.setAuthorizedUpdater(agent, true);

        // Mint initial USDT to deployer for seeding
        usdt.mint(msg.sender, 100_000e6);

        vm.stopBroadcast();

        console.log("MockUSDT:", address(usdt));
        console.log("CreditRegistry:", address(registry));
        console.log("LoanPool:", address(pool));
        console.log("Agent:", agent);
    }
}
