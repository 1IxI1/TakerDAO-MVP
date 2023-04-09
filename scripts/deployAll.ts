import { toNano, Address } from 'ton-core';
import { Main } from '../wrappers/Main';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';
import { PseudoAuction } from '../wrappers/PseudoAuction';
import { compile, NetworkProvider } from '@ton-community/blueprint';

const oracleAddress = Address.parse('EQDP4sDwGQ8BMi4xKBLrJFnCs7_53XJ059Fg2w0dzIJgMqh0')

export async function run(provider: NetworkProvider) {
    const mainCode = await compile('Main');
    const jettonMinterCode = await compile('JettonMinter');
    const jettonWalletCode = await compile('JettonWallet');
    const pseudoAuctionCode = await compile('PseudoAuction');

    const main = provider.open(Main.createFromConfig({
            initTONPrice: 2.22,
            oracle: oracleAddress,
            minCollateralRatio: 1.5,
            now: Math.floor(Date.now() / 1000),
            jettonWalletCode: jettonWalletCode,
            pseudoAuctionCode: pseudoAuctionCode,
        }, mainCode));

    const jettonMaster = provider.open(JettonMinter.createFromConfig({
            pseudoAuctionCode: pseudoAuctionCode,
            jettonWalletCode: jettonWalletCode,
            owner: main.address,
        }, jettonMinterCode));

    const pseudoAuction = provider.open(PseudoAuction.createFromCode(pseudoAuctionCode));

    await jettonMaster.sendDeploy(provider.sender(), toNano('0.05'))

    await provider.waitForDeploy(jettonMaster.address);

    await main.sendDeploy(provider.sender(), jettonMaster.address, toNano('0.05'));

    await provider.waitForDeploy(main.address);

    await pseudoAuction.sendDeploy(provider.sender(), jettonMaster.address, toNano('0.05'));

    await provider.waitForDeploy(pseudoAuction.address);
}
