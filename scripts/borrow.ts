import { Address, toNano, fromNano } from 'ton-core';
import { Main } from '../wrappers/Main';
import { NetworkProvider, sleep } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const address = Address.parse(args.length > 0 ? args[0] : await ui.input('Main address'));

    if (!(await provider.isContractDeployed(address))) {
        ui.write(`Error: Contract at address ${address} is not deployed!`);
        return;
    }

    const main = provider.open(Main.createFromAddress(address));

    const stableTokens = Number(args.length > 1 ? args[1] : await ui.input('Stable tokens wanted'));
    const contractData = await main.getContractData();
    const minCollateral = stableTokens * contractData.minCollateralRatio / contractData.tonPrice + 0.3;
    const collateral = toNano(args.length > 2 ? args[2] : await ui.input(`Collateral (minimum ${minCollateral.toFixed(2)})`));

    let vault = await main.getVault(provider.sender().address!);
    ui.write(`Vault before: ${vault}`);
    if (vault) {
        ui.write(`DCR: ${vault.dcr}`);
        ui.write(`Debt: ${vault.debt}`);
        ui.write(`Collateral: ${vault.collateral}`);
    }
    
    await main.sendBorrow(provider.sender(), toNano(stableTokens), collateral);

    ui.write(`Borrowed ${stableTokens} stable tokens with ${fromNano(collateral)} collateral`);
    ui.write(`Waiting for transaction to complete...`);

    await sleep(10000);

    vault = await main.getVault(provider.sender().address!);

    ui.write(`Vault after: `);
    ui.write(`DCR: ${vault?.dcr}`);
    ui.write(`Debt: ${vault?.debt}`);
    ui.write(`Collateral: ${vault?.collateral}`);
}

