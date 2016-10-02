﻿/// <reference path="../../index.d.ts" />

class InterfaceHandler implements IEventHandler {
    private config: IInterfaceHandlerConfig;
    private currentlySniping: boolean;
    private pokeStops: IPokeStopEvent[];
    private gyms: IGymEvent[];
    private currentExp: number;
    private currentStardust: number;
    private previousCaptureAttempts: IPokemonCaptureEvent[];
    private itemsUsedForCapture: number[];
    private currentPokemonCount: number;
    private currentSnipePokemonCount : number;
    private currentItemCount: number;
    private latestPlayerStats: IPlayerStatsEvent;

    constructor(config: IInterfaceHandlerConfig) {
        this.config = config;
        this.config.settingsService.subscribe(this.onSettingsChanged);
        this.currentlySniping = false;
        this.previousCaptureAttempts = [];
        this.itemsUsedForCapture = [];
        this.currentExp = 0;
        this.currentStardust = 0;
        this.currentPokemonCount = 0;
        this.currentItemCount = 0;
        this.latestPlayerStats = null;
    }
    public onPokemonUpgraded(pkm: IUpgradeEvent) :void {
        this.config.pokemonMenuController.updatePokemonAfterUpgraded(pkm);
        _.each(this.config.notificationControllers, ctrl => ctrl.addPokemonUpgraded(pkm));
            
    }
    public onSendUpgradePokemonRequest (request: IRequest): void  {

    }
    public onUpdateNickname(ev: IUpdatedNicknameEvent): void {
        this.config.profileInfoController.setUsername(ev.Nickname);
    }
    public onLog(logEvent: ILogEvent): void {
        this.config.consoleController.log(logEvent);
    }

    public onPlayerLevelUp = (levelUp: IPlayerLevelUpEvent): void => {
        
    }

    public onUpdatePosition = (location: IUpdatePositionEvent): void => {
        if (!this.currentlySniping) {
            this.config.map.movePlayer(location);
        }
    }

    public onPokeStopList = (forts: IFortEvent[]): void => {
        if (!this.pokeStops) {
            this.pokeStops = [];
        }
        if (!this.gyms) {
            this.gyms = [];
        }
        for (let i = 0; i < forts.length; i++) {
            this.config.fortCacheService.addFort(forts[i], true);
            if (forts[i].Type === 1) {
                const pokeStop = forts[i] as IPokeStopEvent;
                pokeStop.Status = PokeStopStatus.Normal;
                if (pokeStop.CooldownCompleteTimestampMs) {
                    const currentMs = TimeUtils.getCurrentTimestampMs();
                    if (pokeStop.CooldownCompleteTimestampMs > currentMs) {
                        pokeStop.Status |= PokeStopStatus.Visited;
                    }
                }
                if (pokeStop.LureInfo !== null) {
                    pokeStop.Status |= PokeStopStatus.Lure;
                }
                this.addFortToList(pokeStop, this.pokeStops);
            } else {
                this.addFortToList(forts[i], this.gyms);
            }
        }
        this.config.map.setPokeStops(this.pokeStops);
        this.config.map.setGyms(this.gyms);
    }

    private addFortToList = (fort: IFortEvent, fortList: IFortEvent[]): void => {
        const index = _.findIndex(fortList, f => f.Id === fort.Id);
        if (index === -1) {
            fortList.push(fort);
        } else {
            fort.Name = fortList[index].Name;
            fortList[index] = fort;
        }
    }

    public onFortTarget(fortTarget: IFortTargetEvent): void {
        this.config.map.targetFort(fortTarget);
    }

    public onFortUsed(fortUsed: IFortUsedEvent): void {
        const itemsAddedCount = _.sum(_.map(fortUsed.ItemsList, item => item.Count));
        this.currentItemCount += itemsAddedCount;
        this.config.mainMenuController.setItemCount(this.currentItemCount);
        this.config.fortCacheService.setName(fortUsed.Id, fortUsed.Name);
        const pokeStop = _.find(this.pokeStops, ps => ps.Id === fortUsed.Id);
        
        if(pokeStop){
            pokeStop.Name = fortUsed.Name;
        }
        else {
            //this.pokeStops.push(fortUsed);           
        }

        this.config.map.usePokeStop(fortUsed);
        this.currentExp += fortUsed.Exp;
        _.each(this.config.notificationControllers, ctrl => ctrl.addNotificationPokeStopUsed(fortUsed));
        this.config.profileInfoController.addExp(this.currentExp, fortUsed.Exp);
    }

    public onProfile(profile: IProfileEvent): void {
        this.config.mainMenuController.updateProfileData(profile);
        this.config.profileInfoController.setProfileData(profile);
        this.config.requestSender.sendGetConfigRequest();
        this.config.requestSender.sendPlayerStatsRequest();
        this.config.requestSender.sendGetPokemonSettingsRequest();
        this.config.requestSender.sendPokemonSnipeListUpdateRequest();
        this.config.requestSender.sendInventoryListRequest();
        this.config.requestSender.sendPokemonListRequest();
        this.config.requestSender.sendEggsListRequest();
    }

    public onUseBerry(berry: IUseBerryEvent): void {
        this.currentItemCount--;
        this.config.mainMenuController.setItemCount(this.currentItemCount);

        const berryId = berry.BerryType || StaticData.berryIds[0];
        this.itemsUsedForCapture.push(berryId);
    }

    public onPokemonCapture = (pokemonCapture: IPokemonCaptureEvent): void => {
        this.currentItemCount--;
        this.config.mainMenuController.setItemCount(this.currentItemCount);
        this.config.pokemonMenuController.onPokemonCapture(pokemonCapture);

        if (this.previousCaptureAttempts.length > 0 && this.previousCaptureAttempts[0].Id !== pokemonCapture.Id) {
            this.previousCaptureAttempts = [];
            if (this.itemsUsedForCapture.length > 0) {
                const lastUsed = _.last(this.itemsUsedForCapture);
                if (StaticData.berryIds.indexOf(lastUsed) === -1) {
                    this.itemsUsedForCapture = [];
                }
            }
        }
        this.previousCaptureAttempts.push(pokemonCapture);
        this.itemsUsedForCapture.push(pokemonCapture.Pokeball);
        if (pokemonCapture.Status === PokemonCatchStatus.Success) {
            this.config.map.onPokemonCapture(pokemonCapture);
            _.each(this.config.notificationControllers, ctrl => ctrl.addNotificationPokemonCapture(this.previousCaptureAttempts, this.itemsUsedForCapture));
            this.currentExp += pokemonCapture.Exp;
            this.config.profileInfoController.addExp(this.currentExp, pokemonCapture.Exp);
            const previousStardust = this.currentStardust;
            const stardustAdded = pokemonCapture.Stardust - previousStardust;
            this.currentStardust = pokemonCapture.Stardust;
            this.config.profileInfoController.addStardust(pokemonCapture.Stardust, 100);
            this.currentPokemonCount++;
            this.config.mainMenuController.setPokemonCount(this.currentPokemonCount);
        }
    }

    public onEvolveCount(evolveCount: IEvolveCountEvent): void {
        
    }

    public onPokemonEvolve(pokemonEvolve: IPokemonEvolveEvent): void {
        _.each(this.config.notificationControllers, ctrl => ctrl.addNotificationPokemonEvolved(pokemonEvolve));
        this.currentExp += pokemonEvolve.Exp;
        this.config.profileInfoController.addExp(this.currentExp, pokemonEvolve.Exp);
    }

    public onSnipeScan(snipeScan: ISnipeScanEvent): void {
        
    }

    public onSnipeMode(snipeMode: ISnipeModeEvent): void {
        this.currentlySniping = snipeMode.Active;
    }

    public onSnipeMessage(snipeMessage: ISnipeMessageEvent): void {
        
    }

    public onUpdate(update: IUpdateEvent): void {

    }

    public onWarn(warn: IWarnEvent): void {

    }

    public onEggHatched(eggHatched: IEggHatchedEvent): void {
        _.each(this.config.notificationControllers, ctrl => ctrl.addNotificationEggHatched(eggHatched));
    }

    public onIncubatorStatus(incubatorStatus: IIncubatorStatusEvent): void {
        _.each(this.config.notificationControllers, ctrl => ctrl.addNotificationIncubatorStatus(incubatorStatus));
    }

    public onItemRecycle(itemRecycle: IItemRecycleEvent): void {
        _.each(this.config.notificationControllers, ctrl => ctrl.addNotificationItemRecycle(itemRecycle));
        this.currentItemCount -= itemRecycle.Count;
        this.config.mainMenuController.setItemCount(this.currentItemCount);
    }

    public onPokemonTransfer(pokemonTransfer: IPokemonTransferEvent): void {
        _.each(this.config.notificationControllers, ctrl => ctrl.addNotificationPokemonTransfer(pokemonTransfer));
        this.currentPokemonCount--;
        this.config.mainMenuController.setPokemonCount(this.currentPokemonCount);
    }

    public onGetConfig(configEvent: IConfigEvent): void {
        this.config.botConfigMenuController.setBotConfig(configEvent);
    }

    public onPokemonList(pokemonList: IPokemonListEvent): void {
        this.config.pokemonMenuController.updatePokemonList(pokemonList);
        this.currentPokemonCount = pokemonList.Pokemons.length;
        this.config.mainMenuController.setPokemonCount(this.currentPokemonCount);
    }

    public onEggList(eggList: IEggListEvent): void {
        const totalIncubated = _.filter(eggList.Incubators, inc => inc.PokemonId != "0").length;
        const totalUnincubated = eggList.UnusedEggs.length;
        if (this.config.requestSender.currentBotFamily === BotFamily.Necro) {
            this.config.eggMenuController.updateEggList(eggList, this.latestPlayerStats.KmWalked);
        } else {
            this.config.eggMenuController.updateEggList(eggList);
        }
        this.config.mainMenuController.setEggCount(totalIncubated + totalUnincubated);
    }

    public onInventoryList(inventoryList: IInventoryListEvent): void {
        const totalCount = _.sum(_.map(inventoryList.Items, item => item.Count));
        this.config.inventoryMenuController.updateInventoryList(inventoryList);
        this.currentItemCount = totalCount;
        this.config.mainMenuController.setItemCount(this.currentItemCount);
    }

    public onPlayerStats(playerStats: IPlayerStatsEvent): void {
        this.currentExp = playerStats.Experience;
        this.config.profileInfoController.setPlayerStats(playerStats);
        this.latestPlayerStats = playerStats;
    }

    public onSendGetConfigRequest(request: IRequest): void {

    }

    public onSendPokemonListRequest(request: IRequest): void {
        this.config.pokemonMenuController.pokemonListRequested(request);
    }

    public onSendEggsListRequest(request: IRequest): void {
        this.config.eggMenuController.eggListRequested(request);
    }

    public onHumanSnipeList(pokemonList: IHumanWalkSnipeListEvent): void {
        this.config.snipesMenuController.updateSnipePokemonList(pokemonList);
        const currentSnipePokemonCount = pokemonList.Pokemons.length;
        this.config.mainMenuController.setSnipePokemonCount(currentSnipePokemonCount);
        this.config.mainMenuController.showSnipesMenu();
    }
    public onHumanSnipeReachedDestination(ev: IHumanWalkSnipeReachedEvent) :void {
        this.config.map.onHumanSnipeReachedDestination(ev);
        _.each(this.config.notificationControllers, ctrl => ctrl.addHumanSnipeReachedDestination(ev));
        
    }
    public onHumanSnipeStart(snipePokemon :IHumanWalkSnipeStartEvent) : void {
        snipePokemon.PokemonName = this.config.translationController.translation.pokemonNames[snipePokemon.PokemonId]

        this.config.map.onSnipePokemonStart(  snipePokemon);
        _.each(this.config.notificationControllers, ctrl => ctrl.addHumanWalkSnipeStart(snipePokemon));
        
    }
    public onSendInventoryListRequest(request: IRequest): void {
        this.config.inventoryMenuController.inventoryListRequested(request);
    }
     public onSendHumanSnipePokemonRequest(request: IRequest): void {
        //this.config.inventoryMenuController.inventoryListRequested(request);
    }
    public onSendHumanSnipPokemonListUpdateRequest(request:IRequest) : void {
    
    }
    public onSendHumanSnipePokemonRemoveRequest(request:IRequest) : void {
        let currentSnipePokemonCount = this.currentSnipePokemonCount -1;
        this.config.mainMenuController.setSnipePokemonCount(currentSnipePokemonCount);
    }
    public onSendPlayerStatsRequest(request: IRequest): void {
        
    }

    public onSendGetPokemonSettingsRequest(request: IRequest): void {
        
    }

    public onSendTransferPokemonRequest(request: IRequest): void {
        
    }

    public onSendEvolvePokemonRequest(request: IRequest): void {
        
    }
    public onSendRecycleRequest = (request: IRecycleRequest) : void => {
    }
    public onMoveToTargetRequest = (request: IMoveToLocationRequest): void => {

    }
    public onSettingsChanged = (settings: ISettings, previousSettings: ISettings):void => {
        this.config.map.config.followPlayer = settings.mapFolllowPlayer;
    }

}