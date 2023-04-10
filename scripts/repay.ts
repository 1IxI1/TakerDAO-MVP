import { Address, toNano, fromNano } from 'ton-core';
import { Main } from '../wrappers/Main';
import { JettonWallet } from '../wrappers/JettonWallet';
import { JettonMinter } from '../wrappers/JettonMinter';
import { NetworkProvider, sleep } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const address = Address.parse(args.length > 0 ? args[0] : await ui.input('Main contract address'));
    if (!(await provider.isContractDeployed(address))) {
        ui.write(`Error: Contract at address ${address} is not deployed!`);
        return;
    }

    const main = provider.open(Main.createFromAddress(address));
    const contractData = await main.getContractData();

    const jettonMinter = provider.open(JettonMinter.createFromAddress(contractData.jettonMasterAddress));

    let vault = await main.getVault(provider.sender().address!);

    if (!vault) {
        ui.write(`Error: You have no debt!`);
        return;
    }

    const stableTokens = toNano(args.length > 1 ? args[1] : await ui.input(`Stable tokens to repay (max ${fromNano(vault.debt)})`));
    const wantedCollateral = toNano(args.length > 2 ? args[2] : await ui.input(`Wanted collateral (max ${fromNano(vault.collateral)})`));

    ui.write(`Vault before: ${vault}`);
    ui.write(`DCR: ${vault?.dcr}`);
    ui.write(`Debt: ${vault?.debt}`);
    ui.write(`Collateral: ${vault?.collateral}`);

    const jettonWalletAddress = await jettonMinter.getWalletAddress(provider.sender().address!);
    const jettonWallet = provider.open(JettonWallet.createFromAddress(jettonWalletAddress));
    
    await jettonWallet.sendRepayRequest(provider.sender(), stableTokens, wantedCollateral, toNano('0.05'));

    ui.write(`Repay request sent`);
    ui.write(`Waiting for transaction to complete...`);

    await sleep(10000);

    vault = await main.getVault(provider.sender().address!);

    ui.write(`Vault after`);
    ui.write(`DCR: ${vault?.dcr}`);
    ui.write(`Debt: ${vault?.debt}`);
    ui.write(`Collateral: ${vault?.collateral}`);
}
