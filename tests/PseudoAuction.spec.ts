import { Blockchain, SandboxContract } from '@ton-community/sandbox';
import { Cell, toNano } from 'ton-core';
import { PseudoAuction } from '../wrappers/PseudoAuction';
import '@ton-community/test-utils';
import { compile } from '@ton-community/blueprint';

describe('PseudoAuction', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('PseudoAuction');
    });

    let blockchain: Blockchain;
    let pseudoAuction: SandboxContract<PseudoAuction>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        pseudoAuction = blockchain.openContract(PseudoAuction.createFromConfig({}, code));

        const deployer = await blockchain.treasury('deployer');

        const deployResult = await pseudoAuction.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: pseudoAuction.address,
            deploy: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and pseudoAuction are ready to use
    });
});
