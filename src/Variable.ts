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

abstract class InternalVariable<T> {
  public readonly name: string;
  public readonly ls: LocalStorage;
  public readonly defaultValue: T;
  public readonly type: string;

  constructor(name: string, defaultValue: T, ls: LocalStorage) {
    this.name = name;
    this.defaultValue = defaultValue;
    this.ls = ls;
    this.type = typeof this.defaultValue;
  }

  public itemName = (domain?: Domain) => "VARIABLES_" + (domain !== undefined ? domain.toString() : "");

  protected getPersistent = (domain?: Domain): IPersistent => {
    const str = this.ls.getItem(this.itemName(domain));
    return str ? JSON.parse(str) : {};
  };

  protected setPersistent = (object: IPersistent, domain?: Domain): void => {
    this.ls.setItem(this.itemName(domain), JSON.stringify(object));
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
   * Reset this varaible to the default value.
   */
  public reset = (domain?: Domain): void => {
    const d = this.getPersistent(domain);

    delete d[this.name];
    this.setPersistent(d, domain);
  };

  /**
   * Set the value of this variable in a global or specific domain.
   */
  public abstract set(value: T | string, domain?: Domain): boolean;
}

export class Variable<T> extends InternalVariable<T> {
  public set = (value: T | string, domain?: Domain): boolean => {
    // If value is given as a string and the internal value is not a string, it means that the value is stringified
    if (this.type !== "string" && typeof value === "string") {
      // Try to parse the value
      try {
        value = JSON.parse(value);
      } catch {
        return false;
      }
    }

    // Check that the value is of correct type
    if (typeof value !== this.type) {
      return false;
    }

    const d = this.getPersistent(domain);

    d[this.name] = value;
    this.setPersistent(d, domain);
    return true;
  };
}

export class StringVariable extends InternalVariable<string> {
  public set = (value: string, domain?: Domain): boolean => {
    const d = this.getPersistent(domain);

    d[this.name] = value;
    this.setPersistent(d, domain);
    return true;
  };
}

export class BooleanVariable extends InternalVariable<boolean> {
  public set = (value: boolean | string, domain?: Domain): boolean => {
    if (typeof value === "string") {
      try {
        value = JSON.parse(value) ? true : false;
      } catch {
        value = value ? true : false;
      }
    }

    const d = this.getPersistent(domain);

    d[this.name] = value;
    this.setPersistent(d, domain);
    return true;
  };
}

export class ObjectVariable<T> extends InternalVariable<T> {
  public set = (value: T, domain?: Domain): boolean => {
    const d = this.getPersistent(domain);
    d[this.name] = value;
    this.setPersistent(d, domain);
    return true;
  };

  public setPartial = (value: Partial<T>, domain?: Domain): boolean => {
    const d = this.getPersistent(domain);
    d[this.name] = { ...d[this.name], ...value };
    this.setPersistent(d, domain);
    return true;
  };

  public getProperty = <K extends keyof T>(key: K, domain?: Domain): T[K] => {
    return this.get(domain)[key];
  };

  public setProperty = <K extends keyof T>(key: K, value: T[K], domain?: Domain): boolean => {
    const partial: Partial<T> = {};
    partial[key] = value;
    return this.setPartial(partial, domain);
  };

  public resetProperty = <K extends keyof T>(key: K, domain?: Domain): T[K] => {
    const value = this.defaultValue[key];
    this.setProperty(key, value, domain);
    return value;
  };
}
