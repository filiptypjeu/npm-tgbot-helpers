import { ILocalStorage, Variable } from "persistance";

type ChatID = string | number;

export class Group {
  public readonly variable: Variable<string[]>;
  private readonly domain = "__GROUPS__";

  constructor(public readonly name: string, public readonly ls: ILocalStorage) {
    this.variable = new Variable<string[]>(`${this.name}`, [], this.ls);
  }

  private setMembers(members: string[]) {
    this.variable.set(members, this.domain);
  }

  public toString(): string {
    return this.name;
  }

  /**
   * Get a list of all current members of this group.
   */
  public get members(): string[] {
    return this.variable.get(this.domain);
  }

  /**
   * Check if a chat/user is part of this group.
   */
  public isMember(chatId: ChatID): boolean {
    return this.members.includes(chatId.toString());
  }

  /**
   * A static helper method for checking if a chat/user is part of a single Group or a set of Groups.
   */
  public static isMember(groups: Group | Group[], chatId: ChatID): boolean {
    return (Array.isArray(groups) ? groups : [groups]).reduce<boolean>((res, g) => res || g.isMember(chatId), false);
  }

  /**
   * Remove all members of this group.
   */
  public clear(): Group {
    this.variable.clear(this.domain);
    return this;
  }

  /**
   * Add a chat/user to this group.
   *
   * @returns true if chat/user was added to the group.
   */
  public add = (chatId: ChatID): boolean => {
    const members = this.members;
    const id = chatId.toString();

    if (members.includes(id)) {
      return false;
    }

    this.setMembers(members.concat([id]));
    return true;
  };

  /**
   * Toggle membership of this group for a chat/user.
   *
   * @returns true if chat/user was added to the group, false is removed.
   */
  public toggle = (chatId: ChatID): boolean => {
    const members = this.members;
    const id = chatId.toString();

    if (members.includes(id)) {
      this.setMembers(members.filter(m => m !== id));
      return false;
    }

    this.setMembers(members.concat([id]));
    return true;
  };
}
