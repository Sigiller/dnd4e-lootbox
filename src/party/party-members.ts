import { DEFAULT_PARTY_FOLDER_NAME, PARTY_SHEET_FOLDER_SETTING, PARTY_SHEET_MODULE_ID } from "../constants.js";
import { isPlayerCharacter } from "../types/dnd4e.js";

function partyFolderName(): string {
  if (game.modules?.get(PARTY_SHEET_MODULE_ID)?.active) {
    const name = game.settings?.get(PARTY_SHEET_MODULE_ID, PARTY_SHEET_FOLDER_SETTING);
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return DEFAULT_PARTY_FOLDER_NAME;
}

function folderIdOf(actor: Actor.Implementation): string | null {
  const folder = actor.folder;
  if (!folder) return null;
  return typeof folder === "string" ? folder : folder.id;
}

function hasPlayerOwner(actor: Actor.Implementation): boolean {
  return (game.users?.contents ?? []).some(
    (user) => !user.isGM && actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
  );
}

/**
 * Player characters directly in the party folder (the dnd4e-party-sheet setting, else
 * "Party"). Without such a folder: every player character a player owns.
 */
export function getPartyMembers(): Actor.Implementation[] {
  const name = partyFolderName().toLowerCase();
  const folder = game.folders?.find((f) => f.type === "Actor" && f.name.trim().toLowerCase() === name);
  const actors = (game.actors?.contents ?? []).filter(isPlayerCharacter);
  const members = folder
    ? actors.filter((actor) => folderIdOf(actor) === folder.id)
    : actors.filter(hasPlayerOwner);
  return members.sort((a, b) => a.name.localeCompare(b.name));
}
