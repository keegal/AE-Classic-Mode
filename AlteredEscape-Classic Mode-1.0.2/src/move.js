"use strict";

/* Based on the item action, determine whose inventories we should be looking at for from and to. */
function getOwnerInventoryItems(body, sessionID) {
    let isSameInventory = false;
    let pmcItems = profile_f.handler.getPmcProfile(sessionID).Inventory.items;
    let scavData = profile_f.handler.getScavProfile(sessionID);
    let fromInventoryItems = pmcItems;
    let fromType = "pmc";

    if ("fromOwner" in body) {
        if (body.fromOwner.id === scavData._id) {
            fromInventoryItems = scavData.Inventory.items;
            fromType = "scav";
        } else if (body.fromOwner.type === "Mail") {
            fromInventoryItems = dialogue_f.handler.getMessageItemContents(body.fromOwner.id, sessionID);
            fromType = "mail";
        }
    }

    // Don't need to worry about mail for destination because client doesn't allow
    // users to move items back into the mail stash.
    let toInventoryItems = pmcItems;
    let toType = "pmc";

    if ("toOwner" in body && body.toOwner.id === scavData._id) {
        toInventoryItems = scavData.Inventory.items;
        toType = "scav";
    }

    if (fromType === toType) {
        isSameInventory = true;
    }

    return {
        from: fromInventoryItems,
        to: toInventoryItems,
        sameInventory: isSameInventory,
        isMail: fromType === "mail"
    };
}

/* Move Item
* change location of item with parentId and slotId
* transfers items from one profile to another if fromOwner/toOwner is set in the body.
* otherwise, move is contained within the same profile_f.
* */
function moveItem(pmcData, body, sessionID) {
    let output = item_f.handler.getOutput();
	//console.log(body);
	//console.log(global._database.items[pmcData.Inventory.items.find(item => item._id == body.item)._tpl]);
    let inventoryItems = getOwnerInventoryItems(body, sessionID);
   /*  if (inventoryItems.isMail) {
        let idsToMove = dialogue_f.findAndReturnChildren(inventoryItems.from, body.item);
        for (let itemId of idsToMove) {
            for (let messageItem of inventoryItems.from) {
                if (messageItem._id === itemId) {
                    inventoryItems.to.push(messageItem);
                }
            }
        }
        moveItemInternal(inventoryItems.to, body);
    } else */ 
	if (inventoryItems.sameInventory) {
        moveItemInternal(inventoryItems.from, body);
    } else {
        moveItemToProfile(inventoryItems.from, inventoryItems.to, body);
    }

    return output;
}

module.exports.applyInventoryChanges = (pmcData, body, sessionID) => {
    const output = item_f.handler.getOutput()

    if (body.changedItems !== null) {
        for (const changed_item of body.changedItems) {
            for (const [key, item] of Object.entries(pmcData.Inventory.items)) {
                if (item._id === changed_item._id) {
                    pmcData.Inventory.items[key] = changed_item
                    output.items.change.push(changed_item)
                    break
                }
            }
        }
    }
    if (body.deletedItems !== null) {
        for (const deleted_item of body.deletedItems) {
            for (const [key, item] of Object.entries(pmcData.Inventory.items)) {
                if (item._id === deleted_item._id) {
                    pmcData.Inventory.items.splice(key)
                    output.items.del.push(deleted_item)
                    break
                }
            }
        }
    }
}


/* Internal helper function to transfer an item from one profile to another.
* fromProfileData: Profile of the source.
* toProfileData: Profile of the destination.
* body: Move request
*/
function moveItemToProfile(fromItems, toItems, body) {
    handleCartridges(fromItems, body);

    let idsToMove = helper_f.findAndReturnChildrenByItems(fromItems, body.item);

    for (let itemId of idsToMove) {
        for (let itemIndex in fromItems) {
            if (fromItems[itemIndex]._id && fromItems[itemIndex]._id === itemId) {
                if (itemId === body.item) {
                    fromItems[itemIndex].parentId = body.to.id;
                    fromItems[itemIndex].slotId = body.to.container;

                    if ("location" in body.to) {
                        fromItems[itemIndex].location = body.to.location;
                    } else {
                        if (fromItems[itemIndex].location) {
                            delete fromItems[itemIndex].location;
                        }
                    }
                }

                toItems.push(fromItems[itemIndex]);
                fromItems.splice(itemIndex, 1);

            }
        }
    }
}

/* Internal helper function to move item within the same profile_f.
* items: Items
* body: Move request
*/
function moveItemInternal(items, body) {
    handleCartridges(items, body);

    for (let item of items) {
        if (item._id && item._id === body.item) {
            item.parentId = body.to.id;
            item.slotId = body.to.container;

            if ("location" in body.to) {
                item.location = body.to.location;
            } else {
                if (item.location) {
                    delete item.location;
                }
            }

            return;
        }
    }
}

/* Internal helper function to handle cartridges in inventory if any of them exist.
* items: Items
* body: Move request
*/
function handleCartridges(items, body) {
    // -> Move item to diffrent place - counts with equiping filling magazine etc
    if (body.to.container === 'cartridges') {
        let tmp_counter = 0;

        for (let item_ammo in items) {
            if (body.to.id === items[item_ammo].parentId) {
                tmp_counter++;
            }
        }

        body.to.location = tmp_counter;//wrong location for first cartrige
    }
}

/* Remove item of itemId and all of its descendants from profile. */
function removeItemFromProfile(profileData, itemId, output = null) {
    // get items to remove
    let ids_toremove = helper_f.findAndReturnChildren(profileData, itemId);

     //remove one by one all related items and itself
    for (let i in ids_toremove) {
        if (output !== null) {
            output.items.del.push({"_id": ids_toremove[i]});
        }

        for (let a in profileData.Inventory.items) {
            if (profileData.Inventory.items[a]._id === ids_toremove[i]) {
                profileData.Inventory.items.splice(a, 1);
            }
        }
    }
}

/*
* Remove Item
* Deep tree item deletion / Delets main item and all sub items with sub items ... and so on.
*/
function removeItem(profileData, body, output, sessionID) {
    let toDo = [body];

    //Find the item and all of it's relates
    if (toDo[0] === undefined || toDo[0] === null || toDo[0] === "undefined") {
		logger.logError(`item id is ${toDo[0]} with body ${body}`);
        return "";
    }

    removeItemFromProfile(profileData, toDo[0], output);
    return output;
}

function discardItem(pmcData, body, sessionID) {
    insurance_f.handler.remove(pmcData, body.item, sessionID);
    return removeItem(pmcData, body.item, item_f.handler.getOutput(), sessionID);
}

/* Split Item
* spliting 1 item into 2 separate items ...
* */
function splitItem(pmcData, body, sessionID) {
    let output = item_f.handler.getOutput();
    let location = body.container.location;
    let inventoryItems = getOwnerInventoryItems(body, sessionID);

    if (!("location" in body.container) && body.container.container === "cartridges") {
        let tmp_counter = 0;

        for (let item_ammo in inventoryItems.to) {
            if (inventoryItems.to[item_ammo].parentId === body.container.id) {
                tmp_counter++;
            }
        }

        location = tmp_counter;//wrong location for first cartrige
    }

	let items = getOwnerInventoryItems(body, sessionID);
    // The item being merged is possible from three different sources: pmc, scav, or mail.
    for (let item of items.from) {
        if (item._id && item._id === body.item) {
            item.upd.StackObjectsCount -= body.count;

            let newItem = utility.generateNewItemId();

            output.items.new.push({
                "_id": newItem,
                "_tpl": item._tpl,
                "parentId": body.container.id,
                "slotId": body.container.container,
                "location": location,
                "upd": {"StackObjectsCount": body.count}
            });

            items.to.push({
                "_id": newItem,
                "_tpl": item._tpl,
                "parentId": body.container.id,
                "slotId": body.container.container,
                "location": location,
                "upd": {"StackObjectsCount": body.count}
            });

            return output;
        }
    }

    return "";
}

/* Merge Item
* merges 2 items into one, deletes item from body.item and adding number of stacks into body.with
* */
function mergeItem(pmcData, body, sessionID) {
    let output = item_f.handler.getOutput();
    let inventoryItems = getOwnerInventoryItems(body, sessionID);

    for (let key in inventoryItems.to) {
        if (inventoryItems.to[key]._id === body.with) {
            for (let key2 in inventoryItems.from) {
                if (inventoryItems.from[key2]._id && inventoryItems.from[key2]._id === body.item) {
                    let stackItem0 = 1;
                    let stackItem1 = 1;

                    if (!(inventoryItems.to[key].upd && inventoryItems.to[key].upd.StackObjectsCount)) {
                        inventoryItems.to[key].upd = {"StackObjectsCount" : 1};
                    } else if (!(inventoryItems.to[key2].upd && inventoryItems.to[key2].upd.StackObjectsCount)) {
                        inventoryItems.from[key2].upd = {"StackObjectsCount" : 1};
                    }

                    if ("upd" in inventoryItems.to[key]) {
                        stackItem0 = inventoryItems.to[key].upd.StackObjectsCount;
                    }

                    if ("upd" in inventoryItems.from[key2]) {
                        stackItem1 = inventoryItems.from[key2].upd.StackObjectsCount;
                    }

                    if (stackItem0 === 1) {
                        Object.assign(inventoryItems.to[key], {"upd": {"StackObjectsCount": 1}});
                    }

                    inventoryItems.to[key].upd.StackObjectsCount = stackItem0 + stackItem1;
                    output.items.del.push({"_id": inventoryItems.from[key2]._id});
                    inventoryItems.from.splice(key2, 1);
                    return output;
                }
            }
        }
    }

    return "";
}

/* Transfer item
* Used to take items from scav inventory into stash or to insert ammo into mags (shotgun ones) and reloading weapon by clicking "Reload"
* */
function transferItem(pmcData, body, sessionID) {
    let output = item_f.handler.getOutput();

    let itemFrom = null, itemTo = null;

    for (let iterItem of pmcData.Inventory.items) {
        if (iterItem._id === body.item) {
            itemFrom = iterItem;
        } else if (iterItem._id === body.with) {
            itemTo = iterItem;
        }
        if (itemFrom !== null && itemTo !== null) break;
    }

    if (itemFrom !== null && itemTo !== null) {
        let stackFrom = 1;

        if ("upd" in itemFrom) {
            stackFrom = itemFrom.upd.StackObjectsCount;
        } else {
            Object.assign(itemFrom, {"upd": {"StackObjectsCount": 1}});
        }

        if (stackFrom > body.count) {
            itemFrom.upd.StackObjectsCount = stackFrom - body.count;
        } else {
            // Moving a full stack onto a smaller stack
            itemFrom.upd.StackObjectsCount = stackFrom - 1;
        }

        let stackTo = 1;

        if ("upd" in itemTo) {
            stackTo = itemTo.upd.StackObjectsCount;
        } else {
            Object.assign(itemTo, {"upd": {"StackObjectsCount": 1}});
        }

        itemTo.upd.StackObjectsCount = stackTo + body.count;
    }

    return output;
}

/* Swap Item
* its used for "reload" if you have weapon in hands and magazine is somewhere else in rig or backpack in equipment
* */
function swapItem(pmcData, body, sessionID) {
    let output = item_f.handler.getOutput();

    for (let iterItem of pmcData.Inventory.items) {
        if (iterItem._id === body.item) {
            iterItem.parentId = body.to.id;         // parentId
            iterItem.slotId = body.to.container;    // slotId
            iterItem.location = body.to.location    // location
        }

        if (iterItem._id === body.item2) {
            iterItem.parentId = body.to2.id;
            iterItem.slotId = body.to2.container;
            delete iterItem.location;
        }
    }

    return output;
}

/* Give Item
* its used for "add" item like gifts etc.
* */
function addItem(pmcData, body, output, sessionID, foundInRaid = false) {
	// const fenceID = "579dc571d53a0658a154fbec";
	let itemLib = [];
	let itemsToAdd = [];
	if (typeof body.items == "undefined"){
        body.items = [{"item_id": body.item_id, "count": body.count}];
    }

	for (let baseItem of body.items)
	{
		if (baseItem.item_id in global._database.globals.ItemPresets)
		{
			const presetItems = helper_f.clone(global._database.globals.ItemPresets[baseItem.item_id]._items);
			itemLib.push(...presetItems);
			baseItem.isPreset = true;
			baseItem.item_id = presetItems[0]._id;
		}
		else if (helper_f.isMoneyTpl(baseItem.item_id))
		{
			itemLib.push({ _id: baseItem.item_id, _tpl: baseItem.item_id });
		}
		else
		{
			// Only grab the relevant trader items and add unique values
			let isBuyingFromFence = false;
			if(body.tid === "579dc571d53a0658a154fbec")
				isBuyingFromFence = true;
			
			const traderItems = trader_f.handler.getAssort(sessionID, body.tid, isBuyingFromFence).items;
			const relevantItems = helper_f.findAndReturnChildrenAsItems(traderItems, baseItem.item_id);
			const toAdd = relevantItems.filter(traderItem => !itemLib.some(item => traderItem._id === item._id));
			itemLib.push(...toAdd);
		}

		for (let item of itemLib)
		{
			if (item._id === baseItem.item_id)
			{
				const tmpItem = helper_f.getItem(item._tpl)[1];
				const itemToAdd = { itemRef: item, count: baseItem.count, isPreset: baseItem.isPreset };
				let MaxStacks = 1;

				// split stacks if the size is higher than allowed by StackMaxSize
				if (baseItem.count > tmpItem._props.StackMaxSize)
				{
					let count = baseItem.count;
					let calc = baseItem.count - (Math.floor(baseItem.count / tmpItem._props.StackMaxSize) * tmpItem._props.StackMaxSize);

					MaxStacks = (calc > 0) ? MaxStacks + Math.floor(count / tmpItem._props.StackMaxSize) : Math.floor(count / tmpItem._props.StackMaxSize);

					for (let sv = 0; sv < MaxStacks; sv++)
					{
						if (count > 0)
						{
							let newItemToAdd = helper_f.clone(itemToAdd);
							if (count > tmpItem._props.StackMaxSize)
							{
								count = count - tmpItem._props.StackMaxSize;
								newItemToAdd.count = tmpItem._props.StackMaxSize;
							}
							else
							{
								newItemToAdd.count = count;
							}
							itemsToAdd.push(newItemToAdd);
						}
					}
				}
				else
				{
					itemsToAdd.push(itemToAdd);
				}
				// stacks prepared
			}
		}
	}

	// Find an empty slot in stash for each of the items being added
	let StashFS_2D = helper_f.getPlayerStashSlotMap(sessionID, pmcData);
	for (let itemToAdd of itemsToAdd)
	{
		let itemSize = helper_f.getItemSize(itemToAdd.itemRef._tpl, itemToAdd.itemRef._id, itemLib);
		let findSlotResult = helper_f.findSlotForItem(StashFS_2D, itemSize[0], itemSize[1]);

		if (findSlotResult.success)
		{
			/* Fill in the StashFS_2D with an imaginary item, to simulate it already being added
			* so the next item to search for a free slot won't find the same one */
			let itemSizeX = findSlotResult.rotation ? itemSize[1] : itemSize[0];
			let itemSizeY = findSlotResult.rotation ? itemSize[0] : itemSize[1];

			try
			{
				StashFS_2D = helper_f.fillContainerMapWithItem(StashFS_2D, findSlotResult.x, findSlotResult.y, itemSizeX, itemSizeY);
			}
			catch (err)
			{
				logger.logError("fillContainerMapWithItem returned with an error" + typeof err === "string" ? ` -> ${err}` : "");
				return helper_f.appendErrorToOutput(output, "Not enough stash space");
			}

			itemToAdd.location = { x: findSlotResult.x, y: findSlotResult.y, rotation: findSlotResult.rotation };
		}
		else
		{
			return helper_f.appendErrorToOutput(output, "Not enough stash space");
		}
	}

	// We've succesfully found a slot for each item, let's execute the callback and see if it fails (ex. payMoney might fail)
	try
	{
		if (typeof callback === "function")
		{
			callback();
		}
	}
	catch (err)
	{
		let message = typeof err === "string" ? err : "An unknown error occurred";
		return helper_f.appendErrorToOutput(output, message);
	}

	for (let itemToAdd of itemsToAdd)
	{
		let newItem = utility.generateNewItemId();
		let toDo = [[itemToAdd.itemRef._id, newItem]];
		let upd = {"StackObjectsCount": itemToAdd.count};

		//if it is from ItemPreset, load preset's upd data too.
		if (itemToAdd.isPreset)
		{
			for (let updID in itemToAdd.itemRef.upd)
			{
				upd[updID] = itemToAdd.itemRef.upd[updID];
			}
		}

		// in case people want all items to be marked as found in raid
		if (global._database.gameplayConfig.trading.buyItemsMarkedFound)
		{
			foundInRaid = true;
		}

		// hideout items need to be marked as found in raid
		if (foundInRaid)
		{
			upd["SpawnedInSession"] = true;
		}

		output.items.new.push({
			"_id": newItem,
			"_tpl": itemToAdd.itemRef._tpl,
			"parentId": pmcData.Inventory.stash,
			"slotId": "hideout",
			"location": {"x": itemToAdd.location.x, "y": itemToAdd.location.y, "r": itemToAdd.location.rotation ? 1 : 0},
			"upd": upd
		});

		pmcData.Inventory.items.push({
			"_id": newItem,
			"_tpl": itemToAdd.itemRef._tpl,
			"parentId": pmcData.Inventory.stash,
			"slotId": "hideout",
			"location": {"x": itemToAdd.location.x, "y": itemToAdd.location.y, "r": itemToAdd.location.rotation ? 1 : 0},
			"upd": upd
		});

		// If this is an ammobox, add cartridges to it.
		// Damaged ammo box are not loaded.
		const itemInfo = helper_f.getItem(itemToAdd.itemRef._tpl)[1];
		let ammoBoxInfo = itemInfo._props.StackSlots;
		if (ammoBoxInfo !== undefined && itemInfo._name.indexOf("_damaged") < 0)
		{
			// Cartridge info seems to be an array of size 1 for some reason... (See AmmoBox constructor in client code)
			let maxCount = ammoBoxInfo[0]._max_count;
			let ammoTmplId = ammoBoxInfo[0]._props.filters[0].Filter[0];
			let ammoStackMaxSize = helper_f.getItem(ammoTmplId)[1]._props.StackMaxSize;
			let ammos = [];
			let location = 0;

			while (maxCount > 0)
			{
				let ammoStackSize = maxCount <= ammoStackMaxSize ? maxCount : ammoStackMaxSize;
				ammos.push({
					"_id": utility.generateNewItemId(),
					"_tpl": ammoTmplId,
					"parentId": toDo[0][1],
					"slotId": "cartridges",
					"location": location,
					"upd": {"StackObjectsCount": ammoStackSize}
				});

				location++;
				maxCount -= ammoStackMaxSize;
			}

			[output.items.new, pmcData.Inventory.items].forEach(x => x.push.apply(x, ammos));
		}

		while (toDo.length > 0)
		{
			for (let tmpKey in itemLib)
			{
				if (itemLib[tmpKey].parentId && itemLib[tmpKey].parentId === toDo[0][0])
				{
					newItem = utility.generateNewItemId();

					let SlotID = itemLib[tmpKey].slotId;

					//if it is from ItemPreset, load preset's upd data too.
					if (itemToAdd.isPreset)
					{
						upd = {"StackObjectsCount": itemToAdd.count};
						for (let updID in itemLib[tmpKey].upd)
						{
							upd[updID] = itemLib[tmpKey].upd[updID];
						}
					}

					if (SlotID === "hideout")
					{
						output.items.new.push({
							"_id": newItem,
							"_tpl": itemLib[tmpKey]._tpl,
							"parentId": toDo[0][1],
							"slotId": SlotID,
							"location": {"x": itemToAdd.location.x, "y": itemToAdd.location.y, "r": "Horizontal"},
							"upd": upd
						});

						pmcData.Inventory.items.push({
							"_id": newItem,
							"_tpl": itemLib[tmpKey]._tpl,
							"parentId": toDo[0][1],
							"slotId": itemLib[tmpKey].slotId,
							"location": {"x": itemToAdd.location.x, "y": itemToAdd.location.y, "r": "Horizontal"},
							"upd": upd
						});
					}
					else
					{
						output.items.new.push({
							"_id": newItem,
							"_tpl": itemLib[tmpKey]._tpl,
							"parentId": toDo[0][1],
							"slotId": SlotID,
							"upd": upd
						});

						pmcData.Inventory.items.push({
							"_id": newItem,
							"_tpl": itemLib[tmpKey]._tpl,
							"parentId": toDo[0][1],
							"slotId": itemLib[tmpKey].slotId,
							"upd": upd
						});
					}

					toDo.push([itemLib[tmpKey]._id, newItem]);
				}
			}

			toDo.splice(0, 1);
		}
	}
	return output;
}

module.exports.moveItem = moveItem;
module.exports.removeItemFromProfile = removeItemFromProfile;
module.exports.removeItem = removeItem;
module.exports.discardItem = discardItem;
module.exports.splitItem = splitItem;
module.exports.mergeItem = mergeItem;
module.exports.transferItem = transferItem;
module.exports.swapItem = swapItem;
module.exports.addItem = addItem;
