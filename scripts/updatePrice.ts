import { Address } from 'ton-core';
import { Main, formatPrice } from '../wrappers/Main';
import { NetworkProvider, sleep } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const address = Address.parse(args.length > 0 ? args[0] : await ui.input('Main address'));

    if (!(await provider.isContractDeployed(address))) {
        ui.write(`Error: Contract at address ${address} is not deployed!`);
        return;
    }

    const main = provider.open(Main.createFromAddress(address));

    const contractData = await main.getContractData();
    if (!contractData.oracle.equals(provider.sender().address!)) {
        ui.write(`Error: You are not the oracle!`);
        ui.write(`Oracle address: ${contractData.oracle}`);
        return;
    }
    const TONPrice = Number(args.length > 1 ? args[1] : await ui.input(`TON Price (last ${contractData.tonPrice})`));

    await main.sendUpdatePrice(provider.sender(), TONPrice);

    ui.write(`Waiting for transaction to complete...`);

    await sleep(10000);

    const newContractData = await main.getContractData();
    if (newContractData.tonPrice !== formatPrice(TONPrice)) {
        ui.write(`Price was not updated...`);
    } else {
        ui.write(`Price updated to ${TONPrice}`);
    }
}
