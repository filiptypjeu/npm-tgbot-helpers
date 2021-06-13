import { LocalStorage } from "node-localstorage";
import { ChatID } from "./index";

export interface IVariable {
  name: string;
  defaultValue: string | number;
  description?: string;
}

type Domain = ChatID | string;

interface IPersistent {
  [key: string]: string | number;
}

export class VariableManager {
  private readonly variables: IVariable[];
  private readonly ls: LocalStorage;
  private readonly globalDomain = "GLOBAL";

  constructor(variables: IVariable[], ls: LocalStorage) {
    this.variables = variables;
    this.ls = ls;
  }

  private domainVariable = (domain: Domain) => "VARIABLES_" + domain.toString();

  private getDefault = (variableName: string): string | number => {
    const variable = this.variables.find(v => v.name === variableName);
    return variable ? variable.defaultValue : "";
  };

  private getPersistent = (domain?: Domain): IPersistent => {
    const str = this.ls.getItem(this.domainVariable(domain !== undefined ? domain : this.globalDomain));
    return str ? JSON.parse(str) : {};
  };

  private setPersistent = (value: IPersistent, domain?: Domain) => {
    this.ls.setItem(this.domainVariable(domain !== undefined ? domain : this.globalDomain), JSON.stringify(value));
  };

  public get = (variableName: string, domain?: Domain): string | number => {
    const d = this.getPersistent(domain);

    const value = d[variableName];
    if (value === undefined) {
      return this.getDefault(variableName);
    }

    return value;
  };

  public set = (variableName: string, value: string | number, domain?: Domain): void => {
    const d = this.getPersistent(domain);

    d[variableName] = value;
    this.setPersistent(d, domain);
  };
}
