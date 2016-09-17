interface IFortUsedEvent extends IUpdatePositionEvent {
    Id: string;
    Exp: number;
    Gems: number;
    InventoryFull: boolean;
    Items: string;
    Name: string;
    ItemsList: IFortItem[];
    CooldownCompleteTimestampMs: string;

}

interface IFortItem {
    Name: string;
    Count: number;
}