import { toNano } from 'ton-core';
import { PseudoAuction } from '../wrappers/PseudoAuction';
import { compile, NetworkProvider } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider) {
    const pseudoAuction = provider.open(PseudoAuction.createFromConfig({}, await compile('PseudoAuction')));

    await pseudoAuction.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(pseudoAuction.address);

    // run methods on `pseudoAuction`
}
