// Apollo's Time — Save/Load Manager (localStorage)
"use strict";

const SaveManager = {
  SLOT_PREFIX: 'tileforge_save_',
  MAX_SLOTS: 8,

  save(slotIndex) {
    if (!Game.state) return false;
    const data = Game.serialize();
    const saveObj = {
      version: 1,
      date: new Date().toLocaleString(),
      civName: Game.state.config.civName,
      turn: Game.state.turn,
      year: Game.getYearString(),
      era: ERA_NAMES[Game.state.players[0].era],
      data
    };
    try {
      localStorage.setItem(this.SLOT_PREFIX + slotIndex, JSON.stringify(saveObj));
      return true;
    } catch (e) {
      console.error('Save failed:', e);
      return false;
    }
  },

  load(slotIndex) {
    try {
      const raw = localStorage.getItem(this.SLOT_PREFIX + slotIndex);
      if (!raw) return null;
      const saveObj = JSON.parse(raw);
      return saveObj.data;
    } catch (e) {
      console.error('Load failed:', e);
      return null;
    }
  },

  delete(slotIndex) {
    localStorage.removeItem(this.SLOT_PREFIX + slotIndex);
  },

  getSlotInfo(slotIndex) {
    try {
      const raw = localStorage.getItem(this.SLOT_PREFIX + slotIndex);
      if (!raw) return null;
      const saveObj = JSON.parse(raw);
      return {
        civName: saveObj.civName || 'Unknown',
        turn: saveObj.turn || '?',
        era: saveObj.era || 'Unknown',
        date: saveObj.date || 'Unknown'
      };
    } catch {
      return null;
    }
  },

  hasSaves() {
    for (let i = 0; i < this.MAX_SLOTS; i++) {
      if (localStorage.getItem(this.SLOT_PREFIX + i)) return true;
    }
    return false;
  }
};
