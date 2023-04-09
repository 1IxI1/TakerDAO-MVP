import { Address, toNano } from 'ton-core';
import { Main } from '../wrappers/Main';
import { JettonWallet } from '../wrappers/JettonWallet';
import { JettonMinter } from '../wrappers/JettonMinter';
import { NetworkProvider, sleep } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const address = Address.parse(args.length > 0 ? args[0] : await ui.input('Jetton master address'));
    const stableTokens = toNano(args.length > 1 ? args[1] : await ui.input('Stable tokens to repay'));
    const wantedCollateral = toNano(args.length > 2 ? args[2] : await ui.input('Wanted collateral'));

    if (!(await provider.isContractDeployed(address))) {
        ui.write(`Error: Contract at address ${address} is not deployed!`);
        return;
    }

    const jettonMinter = provider.open(JettonMinter.createFromAddress(address));

    const mainAddress = await jettonMinter.getOwner();

    const jettonWalletAddress = await jettonMinter.getWalletAddress(provider.sender().address!);

    const jettonWallet = provider.open(JettonWallet.createFromAddress(jettonWalletAddress));

    const main = provider.open(Main.createFromAddress(mainAddress));

    let vault = await main.getVault(provider.sender().address!);
    ui.write(`Vault before: ${vault}`);
    ui.write(`DCR: ${vault?.dcr}`);
    ui.write(`Debt: ${vault?.debt}`);
    ui.write(`Collateral: ${vault?.collateral}`);
    
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
