export interface TabBar {
    id: string;
    name: string;
}

export interface TabBarState {
    tabBars: Array<TabBar>;
    activeID: TabBar | null;
}
