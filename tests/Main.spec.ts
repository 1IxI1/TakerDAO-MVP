import { Blockchain, SandboxContract, TreasuryContract } from '@ton-community/sandbox';
import { Cell, toNano } from 'ton-core';
import { Main } from '../wrappers/Main';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';
import { PseudoAuction } from '../wrappers/PseudoAuction';
import '@ton-community/test-utils';
import { compile } from '@ton-community/blueprint';

describe('Main', () => {
    let mainCode: Cell;
    let jettonMinterCode: Cell;
    let jettonWalletCode: Cell;
    let pseudoAuctionCode: Cell;

    let blockchain: Blockchain;

    let main: SandboxContract<Main>;
    let jettonMinter: SandboxContract<JettonMinter>;
    let pseudoAuction: SandboxContract<PseudoAuction>;

    let oracle: SandboxContract<TreasuryContract>;

    let user: SandboxContract<TreasuryContract>;
    let userWallet: SandboxContract<JettonWallet>;

    beforeAll(async () => {
        mainCode = await compile('Main');

        blockchain = await Blockchain.create();
        blockchain.now = 100;

        jettonMinterCode = await compile('JettonMinter');
        jettonWalletCode = await compile('JettonWallet');
        pseudoAuctionCode = await compile('PseudoAuction');

        oracle = await blockchain.treasury('oracle');
        user = await blockchain.treasury('user');

        main = blockchain.openContract(Main.createFromConfig({
            initTONPrice: 2,
            oracle: oracle.address,
            minCollateralRatio: 1.5,
            now: blockchain.now,
            jettonWalletCode: jettonWalletCode,
            pseudoAuctionCode: pseudoAuctionCode,
        }, mainCode));

        // blockchain.setVerbosityForAddress(main.address, { vmLogs: 'vm_logs' });

        jettonMinter = blockchain.openContract(JettonMinter.createFromConfig({
            owner: main.address,
            jettonWalletCode: jettonWalletCode,
            pseudoAuctionCode: pseudoAuctionCode,
        }, jettonMinterCode));

        pseudoAuction = blockchain.openContract(PseudoAuction.createFromCode(pseudoAuctionCode));

        const deployer = await blockchain.treasury('deployer');
        const deployJettonResult = await jettonMinter.sendDeploy(deployer.getSender(), toNano('0.15'));
        console.log('jettonMinter address', jettonMinter.address);

        expect(deployJettonResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            deploy: true,
        });

        const deployMainResult = await main.sendDeploy(deployer.getSender(), jettonMinter.address, toNano('0.05'));
        console.log('main address', main.address);

        expect(deployMainResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: main.address,
            deploy: true,
            success: true
        });

        blockchain.setVerbosityForAddress(pseudoAuction.address, { vmLogs: 'vm_logs' });

        const deployAuctionResult = await pseudoAuction.sendDeploy(deployer.getSender(), jettonMinter.address, toNano('0.05'));
        console.log('pseudoAuction address', pseudoAuction.address);

        expect(deployAuctionResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: pseudoAuction.address,
            deploy: true,
            success: true
        });

        userWallet = blockchain.openContract(JettonWallet.createFromConfig({
            owner: user.address,
            mainContractAddress: main.address,
            jettonMasterAddress: jettonMinter.address,
        }, jettonWalletCode));
    });

    it('should deploy', async () => {
        const supply = await jettonMinter.getSupply();
        expect(supply).toBe(toNano('10000'));
     });

    it('user should borrow $1000 with 1000 TON collateral successfully', async () => {
        const openVaultResult = await main.sendBorrow(
            user.getSender(), toNano('1000'), toNano('1000'));

        expect(openVaultResult.transactions).toHaveTransaction({
            from: user.address,
            to: main.address,
            success: true
        });

        expect(openVaultResult.transactions).toHaveTransaction({
            from: main.address,
            to: jettonMinter.address,
            success: true
        });

        expect(openVaultResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: userWallet.address,
            success: true
        });

        const jettonWalletBalance = await userWallet.getBalance();
        expect(jettonWalletBalance).toBe(toNano('1000'));

        const userVault = await main.getVault(user.address);

        expect(userVault).not.toBeNull();
        expect(userVault!.debt).toBe(toNano('1000'));

        const supply = await jettonMinter.getSupply();
        expect(supply).toBe(toNano('11000'));

        console.log("User's DCR:", userVault!.dcr);
    });

    it('should update TON price without any errors or liquidation', async () => {
        const updatePriceResult = await main.sendUpdatePrice(oracle.getSender(), 2.1);

        expect(updatePriceResult.transactions).toHaveTransaction({
            from: oracle.address,
            to: main.address,
            success: true
        });

        const userVault = await main.getVault(user.address);

        expect(userVault).not.toBeNull();
        expect(userVault!.debt).toBe(toNano('1000'));
    });

    it('should let user repay the half of the debt', async () => {
        const repayResult = await userWallet.sendRepayRequest(user.getSender(), toNano('500'), toNano('600'), toNano('0.05'));

        expect(repayResult.transactions).toHaveTransaction({
            from: user.address,
            to: userWallet.address,
            success: true
        });

        expect(repayResult.transactions).toHaveTransaction({
            from: userWallet.address,
            to: main.address,
            success: true
        });

        expect(repayResult.transactions).toHaveTransaction({
            from: main.address,
            to: user.address,
            value: (x) => {
                if (x) return x > toNano(599) && x < toNano(600)
                else return false
            },
            success: true
        });

        expect(repayResult.transactions).toHaveTransaction({
            from: userWallet.address,
            to: jettonMinter.address,
            op: 0x7bdd97de,
            success: true
        });

        const userVault = await main.getVault(user.address);

        expect(userVault).not.toBeNull();
        expect(userVault!.debt).toBe(toNano('500'));

        expect(userVault!.dcr).toBeGreaterThan(0.79);
        expect(userVault!.dcr).toBeLessThanOrEqual(0.8);

        console.log("User's DCR:", userVault!.dcr);

        const userWalletBalance = await userWallet.getBalance();
        expect(userWalletBalance).toBe(toNano('500'));

        const supply = await jettonMinter.getSupply();
        expect(supply).toBe(toNano('10500'));
    });

    it('should drop the price and liquidate the vault', async () => {
        const updatePriceResult = await main.sendUpdatePrice(oracle.getSender(), 1.5);

        expect(updatePriceResult.transactions).toHaveTransaction({
            from: oracle.address,
            to: main.address,
            success: true
        });
        expect(updatePriceResult.transactions).toHaveTransaction({
            from: main.address,
            to: pseudoAuction.address,
            value: (x) => {
                if (x) return x > toNano(399) && x < toNano(400)
                else return false
            },
            success: true
        });
        expect(updatePriceResult.transactions).toHaveTransaction({
            from: pseudoAuction.address,
            to: jettonMinter.address,
            success: true
        });
        expect(updatePriceResult.transactions).toHaveTransaction({
            from: pseudoAuction.address,
            to: user.address,
            op: 0x52,
            value: (x) => { return x! > toNano(140)},
            success: true
        });

        const supply = await jettonMinter.getSupply();
        expect(supply).toBe(toNano('10000'));

        const userVault = await main.getVault(user.address);
        expect(userVault).toBeNull();
    });
});
