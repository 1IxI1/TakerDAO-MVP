import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from 'ton-core';

export class PseudoAuction implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new PseudoAuction(address);
    }

    static createFromCode(code: Cell, workchain = 0) {
        const data = beginCell().endCell();
        const init = { code, data };
        return new PseudoAuction(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, jettonMinterAddress: Address, amount: bigint) {
        await provider.internal(via, {
            value: amount,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                    .storeUint(0x29, 32) // OP init
                    .storeUint(0, 64) // query id
                    .storeAddress(jettonMinterAddress)
                  .endCell(),
        });
    }
}
