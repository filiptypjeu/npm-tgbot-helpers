import { LocalStorage } from "node-localstorage";
import { ChatID } from "./index";
export interface IVariableOptions<T> {
  name: string;
  defaultValue: T;
  description?: string;
}

type Domain = ChatID | string;

interface IPersistent {
  [key: string]: any;
}

export class Variable<T> {
  public readonly name: string;
  private readonly ls: LocalStorage;
  private readonly defaultValue: T;

  constructor(name: string, defaultValue: T, ls: LocalStorage) {
    this.name = name;
    this.defaultValue = defaultValue;
    this.ls = ls;
  }

  private variableName = (domain?: Domain) => "VARIABLES_" + (domain !== undefined ? domain.toString() : "");

  private getPersistent = (domain?: Domain): IPersistent => {
    const str = this.ls.getItem(this.variableName(domain));
    return str ? JSON.parse(str) : {};
  };

  private setPersistent = (object: IPersistent, domain?: Domain): void => {
    this.ls.setItem(this.variableName(domain), JSON.stringify(object));
  };

  /**
   * Get the value of this variable in a global or specific domain.
   */
  public get = (domain?: Domain): T => {
    const d = this.getPersistent(domain);

    const value = d[this.name];
    if (value === undefined) {
      return this.defaultValue;
    }

    return value;
  };

  /**
   * Set the value of this variable in a global or specific domain.
   */
  public set = (value: T, domain?: Domain): void => {
    const d = this.getPersistent(domain);

    d[this.name] = value;
    this.setPersistent(d, domain);
  };

  /**
   * Reset this varaible to the default value.
   */
  public reset = (domain?: Domain): void => {
    const d = this.getPersistent(domain);

    delete d[this.name];
    this.setPersistent(d, domain);
  }
}
