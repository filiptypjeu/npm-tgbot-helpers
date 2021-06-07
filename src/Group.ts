import { LocalStorage } from "node-localstorage";
import { ChatID } from "./index";

export class Group {
  public readonly name: string;
  public readonly variableName: string;
  private ls: LocalStorage;

  constructor(name: string, ls: LocalStorage) {
    this.name = name;
    this.ls = ls;
    this.variableName = "GROUP_" + name;
  }

  private setMembers = (members: ChatID[]) => {
    this.ls.setItem(this.variableName, members.join("\n"));
  };

  /**
   * Get a list of all current members of this group.
   */
  public get members(): string[] {
    const str = this.ls.getItem(this.variableName);
    if (!str) {
      return [];
    }

    return str.trim().split("\n");
  }

  /**
   * Check if a chat/user is part of this group.
   */
  public isMember = (chatId: ChatID): boolean => {
    return this.members.includes(chatId.toString());
  };

  /**
   * Remove all members of this group.
   */
  public reset = (): Group => {
    this.ls.setItem(this.variableName, "");
    return this;
  };

  /**
   * Add a chat/user to this group.
   *
   * @returns true if chat/user was added to the group.
   */
  public add = (chatId: ChatID): boolean => {
    const members = this.members;

    if (members.includes(chatId.toString())) {
      return false;
    }

    this.setMembers(members.concat([chatId.toString()]));

    return true;
  };

  /**
   * Toggle membership of this group for a chat/user.
   *
   * @returns true if chat/user was added to the group, false is removed.
   */
  public toggle = (chatId: ChatID): boolean => {
    const members = this.members;

    if (members.includes(chatId.toString())) {
      this.setMembers(members.filter(m => m !== chatId.toString()));
      return false;
    }

    this.setMembers(members.concat([chatId.toString()]));
    return true;
  };
}
