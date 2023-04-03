import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from 'ton-core';

export type PseudoAuctionConfig = {};

export function pseudoAuctionConfigToCell(config: PseudoAuctionConfig): Cell {
    return beginCell().endCell();
}

export class PseudoAuction implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new PseudoAuction(address);
    }

    static createFromConfig(config: PseudoAuctionConfig, code: Cell, workchain = 0) {
        const data = pseudoAuctionConfigToCell(config);
        const init = { code, data };
        return new PseudoAuction(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
