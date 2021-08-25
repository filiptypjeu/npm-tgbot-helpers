import { LocalStorage } from "node-localstorage";
import TelegramBot, { Message, ParseMode } from "node-telegram-bot-api";
import os from "os";
import readLastLines from "read-last-lines";
import sanitizeHtml from "sanitize-html";
import { Logger } from "log4js";
import { Group } from "./Group";
export { Group } from "./Group";
import { BooleanVariable, Variable } from "./Variable";
export { BooleanVariable, Variable } from "./Variable";

/**
 * @todo
 * - Command allowed for multiple groups
 * - Better info about a user, and a separate command
 * - Add default log command
 */

export interface IGroupExtended {
  group: Group;
  requestCommand: string;
  requestResponse?: string;
  requestPrivateOnly?: boolean;
  requestDescription?: string;
  sendRequestTo: Group;
  toggleCommand: Command;
  toggleDescription?: string;
  responseWhenAdded?: string;
}

export interface ITGBotWrapperOptions {
  telegramBot: TelegramBot;
  localStorage: LocalStorage;
  variables?: Variable<any>[];
  defaultCommands?: {
    init?: Command;
    uptime?: Command;
    userInfo?: Command;
    deactivate?: Command;
    help?: Command;
    kill?: Command;
    ip?: Command;
    var?: Command;
    groups?: Command;
    commands?: {
      command: Command;
      availableFor?: Group;
      description?: string;
    };
    start?: {
      greeting: string;
      addToGroup?: Group;
      description?: string;
    };
  };
  groups?: (Group | IGroupExtended)[];
  sudoGroup: Group;
  commandLogger?: Logger;
  botLogger?: Logger;
  errorLogger?: Logger;
  defaultAccessDeniedMessage?: string;
  defaultPrivateOnlyMessage?: string;
  defaultCommandDeactivatedMessage?: string;
}

export interface IBotHelperCommand {
  command: Command;
  regexp?: RegExp;
  group?: Group;
  privateOnly?: boolean;
  matchBeginningOnly?: boolean;
  hide?: boolean;
  description?: string;
  chatAcion?: TelegramBot.ChatAction;
  accessDeniedMessage?: string;
  callback: (msg: Message) => void;
}

type Command = string;
export type ChatID = string | number;

export class TGBotWrapper {
  public bot: TelegramBot;
  private ls: LocalStorage;

  public thisUser: Promise<TelegramBot.User>;
  public commands: IBotHelperCommand[] = [];
  public groups: Group[] = [];

  public sudoEchoVar: BooleanVariable;
  public sudoLogVar: BooleanVariable;
  public variables: Variable<any>[] = [];

  public startTime: Date;
  public deactivatedCommands: Group;
  private sudoGroup: Group;

  private commandLogger: Logger | undefined;
  private botLogger: Logger | undefined;
  private errorLogger: Logger | undefined;

  public defaultAccessDeniedMessage: string;
  public defaultCommandDeactivatedMessage: string;
  public defaultPrivateOnlyMessage: string;

  constructor(o: ITGBotWrapperOptions) {
    this.bot = o.telegramBot;
    if (!this.bot.isPolling()) {
      this.bot.startPolling();
    }
    this.thisUser = this.bot.getMe();

    this.startTime = new Date();
    this.ls = o.localStorage;

    this.sudoEchoVar = new BooleanVariable("sudoEcho", false, this.ls);
    this.sudoLogVar = new BooleanVariable("sudoLog", false, this.ls);
    this.deactivatedCommands = new Group("deactivatedCommands", this.ls);

    this.sudoGroup = o.sudoGroup;
    this.commandLogger = o.commandLogger;
    this.botLogger = o.botLogger;
    this.errorLogger = o.errorLogger;

    this.defaultAccessDeniedMessage = o.defaultAccessDeniedMessage || "You dont have access to this command.";
    this.defaultCommandDeactivatedMessage = o.defaultCommandDeactivatedMessage || "This command has been deactivated.";
    this.defaultPrivateOnlyMessage = o.defaultPrivateOnlyMessage || "The command can only be used in a private chat.";

    // Add all groups
    for (const group of o.groups || []) {
      if (group instanceof Group) {
        this._addGroup(group);
      } else {
        this._addGroup(group.group);

        // Add request and group toggle commands
        this._addCommand({
          command: group.requestCommand,
          chatAcion: group.requestResponse ? "typing" : undefined,
          privateOnly: group.requestPrivateOnly,
          description: group.requestDescription,
          callback: this.defaultCommandRequest(group.group, group.sendRequestTo, group.requestResponse, group.toggleCommand),
        });
        this._addCommand({
          command: group.toggleCommand,
          chatAcion: "typing",
          group: group.sendRequestTo,
          matchBeginningOnly: true,
          description: group.toggleDescription,
          callback: this.defaultCommandToggle(group.group, group.responseWhenAdded),
        });
      }
    }

    // Add default commands

    if (o.defaultCommands?.deactivate) {
      this._addCommand({
        command: o.defaultCommands.deactivate,
        group: o.sudoGroup,
        chatAcion: "typing",
        description: "Deactivates or reactivates a given command.",
        callback: this.defaultCommandDeactivate,
      });
    }

    if (o.defaultCommands?.help) {
      this._addCommand({
        command: o.defaultCommands.help,
        chatAcion: "typing",
        callback: this.defaultCommandHelp,
      });
    }

    if (o.defaultCommands?.init) {
      this._addCommand({
        command: o.defaultCommands.init,
        chatAcion: "typing",
        privateOnly: true,
        hide: true,
        callback: this.defaultCommandInit(o.sudoGroup),
      });
    }

    if (o.defaultCommands?.kill) {
      this._addCommand({
        command: o.defaultCommands.kill,
        group: o.sudoGroup,
        privateOnly: true,
        chatAcion: "typing",
        description: "Kill the bot.",
        callback: this.defaultCommandKill,
      });
    }

    if (o.defaultCommands?.start) {
      this._addCommand({
        command: "start",
        chatAcion: "typing",
        callback: this.defaultCommandStart(o.defaultCommands.start.greeting, o.defaultCommands.start.addToGroup, o.sudoGroup),
        description: o.defaultCommands.start.description,
      });
    }

    if (o.defaultCommands?.uptime) {
      this._addCommand({
        command: o.defaultCommands.uptime,
        group: o.sudoGroup,
        chatAcion: "typing",
        description: "Get the bot and system uptime.",
        callback: this.defaultCommandUptime,
      });
    }

    if (o.defaultCommands?.ip) {
      this._addCommand({
        command: o.defaultCommands.ip,
        group: o.sudoGroup,
        chatAcion: "typing",
        description: "Get the IP of the system.",
        callback: this.defaultCommandIP,
      });
    }

    if (o.defaultCommands?.commands) {
      this._addCommand({
        command: o.defaultCommands.commands.command,
        group: o.defaultCommands.commands.availableFor,
        chatAcion: "typing",
        description: o.defaultCommands.commands.description,
        callback: this.defaultCommandCommands,
      });
    }

    if (o.defaultCommands?.var) {
      this._addCommand({
        command: o.defaultCommands.var,
        group: o.sudoGroup,
        privateOnly: true,
        chatAcion: "typing",
        description: `See all available variables. Set variables with "/var &lt;number&gt; &lt;value&gt;".`,
        callback: this.defaultCommandVar(),
      });
    }

    if (o.defaultCommands?.groups) {
      this._addCommand({
        command: o.defaultCommands.groups,
        group: o.sudoGroup,
        privateOnly: true,
        chatAcion: "typing",
        description: "Gives the members of a specific group.",
        callback: this.defaultCommandGroups(),
      });
    }

    if (o.defaultCommands?.userInfo) {
      this._addCommand({
        command: o.defaultCommands.userInfo,
        group: o.sudoGroup,
        chatAcion: "typing",
        callback: this.defaultCommandUptime,
      });
    }

    // Add internal variables
    this._addVariable(this.sudoEchoVar);
    this._addVariable(this.sudoLogVar);

    // Add user defined variables
    for (const v of o.variables || []) {
      this._addVariable(v);
    }

    // Add debug listener
    this.bot.on("message", msg => {
      if (msg.from && this.sudoGroup.isMember(msg.from.id)) {
        if (this.sudoLogVar.get()) {
          this.botLogger.info(msg);
        }

        if (this.sudoEchoVar.get()) {
          this.sendTo(msg.chat.id, JSON.stringify(msg, null, 4));
        }
      }
    });

    this.onInit();
  }

  public addCustomCommands = async (commands: IBotHelperCommand[]) => {
    for (const c of commands) {
      this._addCommand(c);
    }

    this.botLogger?.info(`Added ${commands.length} custom commands.`);
  };

  private onInit = async () => {
    const username = (await this.thisUser).username || "UNKNWON_BOT";

    const msg = `${username} initialized with ${this.commands.length} commands, ${this.groups.length} groups and ${this.variables.length} variables.`;
    this.botLogger?.info(msg);
    this.sendToGroup(this.sudoGroup, msg).catch(() => {});
  };

  private _callback = (msg: TelegramBot.Message, c: IBotHelperCommand): boolean => {
    let log = "ok";

    // Check if the command is deactivated
    if (c.group && !c.group.isMember(msg.chat.id)) {
      this.sendTo(msg.chat.id, c.accessDeniedMessage || this.defaultAccessDeniedMessage);
      log = "denied";
    } else if (!this.sudoGroup.isMember(msg.chat.id) && this.deactivatedCommands.isMember(`/${c}`)) {
      this.sendTo(msg.chat.id, this.defaultCommandDeactivatedMessage);
      log = "deactivated";
    } else if (c.privateOnly && msg.chat.type !== "private") {
      this.sendTo(msg.chat.id, this.defaultPrivateOnlyMessage);
      log = "private";
    }

    // Log the command
    this.commandLogger?.info(`${this.longNameFromUser(msg.from!)} : /${c.command} [${log}]`);

    return log === "ok";
  };

  private _addCommand = async (command: IBotHelperCommand) => {
    if (this.commands.find(c => c.command === command.command)) {
      throw new Error(`Duplicate command "${command.command}"`);
    }

    this.bot.onText(this.commandRegExp(command, (await this.thisUser).username), msg => {
      if (!this._callback(msg, command)) {
        return;
      }

      if (command.chatAcion) {
        this.bot.sendChatAction(msg.chat.id, command.chatAcion);
      }

      return command.callback(msg);
    });

    this.commands.push(command);
  };

  private _addGroup = (group: Group) => {
    if (this.groups.find(g => g.name === group.name)) {
      throw new Error(`Duplicate group "${group.name}"`);
    }

    this.groups.push(group);
  };

  private _addVariable = (variable: Variable<any>) => {
    if (this.variables.find(v => v.name === variable.name)) {
      throw new Error(`Duplicate variable "${variable.name}"`);
    }

    this.variables.push(variable);
  };

  /**
   * Creates a RegExp for a command.
   *
   * @param c Command in question.
   * @param botName Name of the TelegramBot.
   */
  public commandRegExp = (c: IBotHelperCommand, botName: string): RegExp => {
    return c.matchBeginningOnly
      ? new RegExp(`^/${c.command}[a-zA-Z0-9_]*(?:$|@${botName}\\b|[^a-zA-Z0-9_@])`)
      : new RegExp(`^/${c.command}(?:$|@${botName}\\b|[^a-zA-Z0-9_@])`);
  };

  /**
   * Orders the commnads by the group that can use them.
   *
   * @param {IBotHelperCommand} cmds Commands to order.
   *
   * @returns A Map<string, IBotHelperCommand[]> that maps group name to commands.
   */
  public commandsByGroup = (): Map<Group | undefined, IBotHelperCommand[]> => {
    // commandsByGroup()?
    const m = new Map<Group | undefined, IBotHelperCommand[]>();
    this.commands.forEach(cmd => {
      const g = cmd.group;
      m.set(g, (m.get(g) || []).concat(cmd));
    });

    return m;
  };

  public msgInfoToString = (msg: TelegramBot.Message): string[] => {
    return [
      `Username: ${msg.from!.username}`,
      `First name: ${msg.from!.first_name}`,
      `Last name: ${msg.from!.last_name}`,
      `Is bot: ${msg.from!.is_bot}`,
      `User ID: ${msg.from!.id}`,
      `Chat type: ${msg.chat.type}`,
    ];
  };

  public getCommand = (msg: TelegramBot.Message): Command => {
    if (!msg.entities || msg.entities[0].offset !== 0 || msg.entities[0].type !== "bot_command") {
      return "";
    }

    return msg.text!.slice(1, msg.entities[0].length).split("@")[0];
  };

  public getArguments = (text?: string): string[] => {
    if (text) {
      return text
        .split("\n")
        .join(" ")
        .split(" ")
        .filter(s => s)
        .slice(1);
    }
    return [];
  };

  public groupToUserInfo = async (group: Group, extraInfo?: string[]) => {
    const userIds = group.members;

    if (userIds.length > 0) {
      return await Promise.all(
        userIds.map(async (n, i) => {
          return await this.bot.getChat(n).then(chat => {
            return `${chat.first_name} ${chat.last_name}, ${chat.username} (ID: ${n}${
              extraInfo ? `, ${extraInfo[i] ? extraInfo[i] : "no info"}` : ""
            })`;
          });
        })
      );
    } else {
      return [];
    }
  };

  public commandFriendlyUserId = (userId: ChatID, minusSubstitute: string = "m"): string => {
    return userId.toString().replace("-", minusSubstitute);
  };

  /**
   * Returns the user/chat ID inside commands that have a user/chat ID appended to them, for example "/command_1234567890" or "/command_1234567890@MyBot".
   *
   * @param command The full command.
   * @param splitAt The character that separates the command and ID.
   * @param minusSubstitute If the ID is of a group chat, which have negative chat IDs, the minus symbol need to be removed because Telegram commands can not have hyphens in them. Default substitue is "m" as in minus.
   */
  public userIdFromCommand = (msg: TelegramBot.Message, splitAt: string = "_", minusSubstitute: string = "m"): ChatID | undefined => {
    let arg = this.getCommand(msg).split(splitAt)[1];
    if (!arg) {
      return undefined;
    }

    if (arg[0] === minusSubstitute) {
      arg = "-" + arg.slice(1);
    }

    const userId = Number(arg);

    if (Number.isSafeInteger(userId)) {
      return userId;
    }

    return undefined;
  };

  public longNameFromUser = (user: TelegramBot.User | TelegramBot.Chat): string => {
    const title = (user as TelegramBot.Chat).title;
    if (title) {
      return title;
    }

    const a: string[] = [user.first_name || "", user.last_name || "", user.username ? "@" + user.username : ""];

    return a
      .filter(s => s)
      .join(" ")
      .trim();
  };

  /**
   * Send a message to a chat. The message is automatically split into several messages if too long.
   *
   * @param userId The chat ID to send the message to.
   * @param text The text to send.
   * @param options Message options.
   */
  public async sendTo(userId: ChatID, text: string, options?: TelegramBot.SendMessageOptions): Promise<void>;
  /**
   * Send a message to a chat. The message is automatically split into several messages if too long.
   *
   * @param userId The chat ID to send the message to.
   * @param text The text to send.
   * @param parseMode How to parse the text.
   * @param silent True = no notification is shown for the receiver.
   * @param noPreview  True = no web page preview is shown for the receiver.
   */
  public async sendTo(userId: ChatID, text: string, parseMode?: ParseMode, silent?: boolean, noPreview?: boolean): Promise<void>;
  public async sendTo(
    userId: ChatID,
    text: string,
    param?: ParseMode | TelegramBot.SendMessageOptions,
    silent: boolean = false,
    noPreview: boolean = false
  ) {
    const sendOptions: TelegramBot.SendMessageOptions =
      typeof param === "object"
        ? param
        : {
            parse_mode: param,
            disable_notification: silent,
            disable_web_page_preview: noPreview,
          };

    this.bot
      .sendMessage(userId, sendOptions.parse_mode === "HTML" ? sanitizeHtml(text, { allowedTags: ["b", "i", "code"] }) : text, sendOptions)
      .catch(async e => {
        if (e.code === "ETELEGRAM") {
          if (e.response.body.description === "Bad Request: message is too long") {
            const splitText = text.split("\n");
            if (splitText.length > 1) {
              await this.sendTo(
                userId,
                splitText
                  .slice(0, Math.round(splitText.length / 2))
                  .join("\n")
                  .trim(),
                sendOptions
              );
              await this.sendTo(
                userId,
                splitText
                  .slice(Math.round(splitText.length / 2))
                  .join("\n")
                  .trim(),
                sendOptions
              );
            } else {
              this.sendError(`Message to userId ${userId} too long (${text.length} characters)...`);
            }
          } else {
            this.sendError(
              `Error code: ${e.code}, msg_length: ${text.length}, ok: ${e.response.body.ok}, error_code: ${e.response.body.error_code}, description: ${e.response.body.description}`
            );
          }
        } else {
          this.errorLogger?.error(e);
        }
      });
  }

  /**
   * Send a message to each member of a group.
   *
   * @param group The group in question.
   * @param text The text to send.
   * @param options Message options.
   */
  public async sendToGroup(group: Group, text: string, options?: TelegramBot.SendMessageOptions): Promise<void[]>;
  /**
   * Send a message to each member of a group.
   *
   * @param group The group in question.
   * @param text The text to send.
   * @param parseMode How to parse the text.
   * @param silent True = no notification is shown for the receiver.
   * @param noPreview  True = no web page preview is shown for the receiver.
   */
  public async sendToGroup(group: Group, text: string, parseMode?: ParseMode, silent?: boolean, noPreview?: boolean): Promise<void[]>;
  public async sendToGroup(
    group: Group,
    text: string,
    param?: ParseMode | TelegramBot.SendMessageOptions,
    silent: boolean = false,
    noPreview: boolean = false
  ) {
    const sendOptions: TelegramBot.SendMessageOptions =
      typeof param === "object"
        ? param
        : {
            parse_mode: param,
            disable_notification: silent,
            disable_web_page_preview: noPreview,
          };
    return Promise.all(group.members.map(id => this.sendTo(id, text, sendOptions)));
  }

  public sendError = async (e: any) => {
    this.botLogger?.error(e);
    return this.sendToGroup(this.sudoGroup, e.toString() ? e.toString().slice(0, 3000) : "Error...");
  };

  /**
   * @param {number | Date} value is the value based on which the duration should be calculated on. Can either be the number of milliseconds of the duration, or a Date object that specifies the start time.
   *
   * @returns {string} the duration in a 'days hours minutes seconds' format.
   */
  public getDurationString = (value: number | Date): string => {
    let v: number;
    if (typeof value === "number") {
      v = value;
    } else {
      v = new Date().valueOf() - value.valueOf();
    }
    const d = Math.floor(v / (3600000 * 24));
    const h = Math.floor((v - d * 3600000 * 24) / 3600000);
    const m = Math.floor((v - d * 3600000 * 24 - h * 3600000) / 60000);
    const s = Math.floor((v - d * 3600000 * 24 - h * 3600000 - m * 60000) / 1000);

    return `${d} day${d === 1 ? "" : "s"} ${h} hour${h === 1 ? "" : "s"} ${m} minute${m === 1 ? "" : "s"} ${s} second${s === 1 ? "" : "s"}`;
  };

  /**
   * Callback method for a command that respons with the current uptime of the bot and OS.
   */
  public defaultCommandUptime = async (msg: TelegramBot.Message) => {
    return Promise.all([this.getDurationString(this.startTime), this.getDurationString(os.uptime() * 1000)]).then(([s1, s2]) =>
      this.sendTo(msg.chat.id, `Bot uptime: ${s1}\nOS uptime: ${s2}`)
    );
  };

  /**
   * Callback method for a command that respons with the IP address(es) of the bot.
   */
  public defaultCommandIP = async (msg: TelegramBot.Message) => {
    const ifaces = os.networkInterfaces();
    let ips = "";

    Object.keys(ifaces).forEach(ifname => {
      let alias = 0;
      ifaces[ifname]!.forEach(iface => {
        // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
        if (iface.family !== "IPv4" || iface.internal) {
          return;
        }

        alias ? (ips += `${ifname}:${alias} ${iface.address}\n`) : (ips += `${ifname} ${iface.address}\n`);

        ++alias;
      });
    });

    return this.sendTo(msg.chat.id, ips ? ips : "No IP addresses found.");
  };

  public defaultCommandCommands = (msg: TelegramBot.Message) => {
    this.commandsByGroup().forEach((cmds, group) => {
      if (!group || group.isMember(msg.chat.id)) {
        this.sendTo(
          msg.chat.id,
          `<b>Commands accessible to ${group ? `group <i>${group}</i>` : "everybody"}:</b>\n` +
            cmds
              .map(cmd => `${cmd.hide ? "(" : ""}/${cmd.command}${cmd.privateOnly ? "*" : ""}${cmd.hide ? ")" : ""}`)
              .sort()
              .join("\n"),
          "HTML"
        );
      }
    });
  };

  public defaultCommandHelp = async (msg: TelegramBot.Message) => {
    return this.sendTo(
      msg.chat.id,
      this.commands
        .filter(cmd => (cmd.group ? cmd.group.isMember(msg.chat.id) : !cmd.hide))
        .map(cmd => `/${cmd.command}${cmd.privateOnly ? "*" : ""}${cmd.description ? ":  " + cmd.description : ""}`)
        .sort()
        .join("\n\n"),
      "HTML"
    );
  };

  public defaultCommandKill = (msg: TelegramBot.Message) => {
    this.sendTo(msg.chat.id, "Good bye!");
    setTimeout(() => {
      return process.exit();
    }, 3000);
  };

  public defaultCommandVar = () => {
    return async (msg: TelegramBot.Message) => {
      const args = this.getArguments(msg.text);

      if (!args[0]) {
        return this.sendTo(
          msg.chat.id,
          "<b>Available variables:</b>\n<code>" +
            this.variables.map((v, i) => `${i} ${v.name}: ${v.type} = ${JSON.stringify(v.get())}`).join("\n") +
            "</code>",
          "HTML"
        );
      } else if (!args[1]) {
        return this.sendTo(msg.chat.id, "Please provide two arguments.");
      } else if (Number(args[0]) >= 0 && Number(args[0]) < this.variables.length) {
        const v = this.variables[Number(args[0])];
        const value = args.slice(1).join(" ").trim();
        try {
          v.set(value);
          return this.sendTo(msg.chat.id, `Variable set: <code>${v.name}: ${v.type} = ${JSON.stringify(v.get())}</code>`, "HTML");
        } catch (e) {
          return this.sendTo(msg.chat.id, `Could not set value JSON.parse(${value})`, "HTML");
        }
      } else {
        return this.sendTo(msg.chat.id, `Variable ${args[0]} does not exist.`);
      }
    };
  };

  /**
   * Creates a callback method for a command that sends a message to a specific chat. The command is expected to be used like "/command_<CHATID> <MESSAGE>". The received message can be formatted freely.
   *
   * @param messageFormatter Function that formats the message to be sent. Can be used to for example add a header or footer to the message.
   */
  public defaultCommandSendTo = (messageFormatter?: (messageToFormat: TelegramBot.Message) => string) => {
    return (msg: TelegramBot.Message) => {
      const text = messageFormatter ? messageFormatter(msg).trim() : msg.text!.split(" ").slice(1).join(" ").trim();
      if (!text) {
        this.sendTo(msg.chat.id, `No text provided...`);
        return;
      }

      const chatId = this.userIdFromCommand(msg);
      if (!chatId) {
        this.sendTo(msg.chat.id, `No chat ID found within the command...`);
        return;
      }

      this.bot
        .getChat(chatId)
        .then(chat => {
          this.sendTo(msg.chat.id, `Message sent to chat ${chatId}!`);
          this.sendTo(chat.id, text, "HTML");
        })
        .catch(() => {
          this.sendTo(msg.chat.id, `No chat with ID ${chatId} is available to the bot...`);
          return;
        });

      return;
    };
  };

  /**
   * Creates a callback method for a command that let's a user send a message to all members of a group. It is used by writing the message after the command, i.e. "/command <message>".
   *
   * @param groupName The name of the group to send the message to.
   * @param emptyResponse The response to the user if the command is used without a message.
   * @param messageFormatter Function that formats the message to be sent. Can be used to for example add a header or footer to the message.
   */
  public defaultCommandSendToGroup = (
    groupName: Group,
    emptyResponse: string,
    messageFormatter: (messageToFormat: TelegramBot.Message) => string
  ) => {
    return (msg: TelegramBot.Message) => {
      if (this.getArguments(msg.text)[0] === undefined && emptyResponse) {
        this.sendTo(msg.chat.id, emptyResponse, "HTML");
      } else {
        this.sendToGroup(groupName, messageFormatter(msg), "HTML");
        this.sendTo(msg.chat.id, "Message sent!");
      }
    };
  };

  /**
   * Creates a callback method for a command that reads the last lines from a certain file and sends them to the chat. The amount of lines can be given as an argument when using the command.
   *
   * @param logPath The path to the file to read from.
   * @param keys Optional string to use as a header.
   */
  public defaultCommandLog = (logPath: string, keys?: string) => {
    return async (msg: TelegramBot.Message) => {
      return readLastLines
        .read(logPath, Number(this.getArguments(msg.text)[0]) < 50 ? Number(this.getArguments(msg.text)[0]) : 50)
        .then(s => this.sendTo(msg.chat.id, s ? (keys ? `<b>${keys}</b>\n${s}` : s) : `File ${logPath} is empty.`, "HTML"))
        .catch(e => this.sendError(e));
    };
  };

  /**
   * Creates a callback method for a command that adds a chat to a certain gruop. Useful when for example starting the bot for the first time and adding yourself as the first admin.
   *
   * @param groupToInitTo The group to add the chat to.
   */
  public defaultCommandInit = (groupToInitTo: Group) => {
    return (msg: TelegramBot.Message) => {
      const userIds = groupToInitTo.members;
      if (!userIds.length) {
        if (groupToInitTo.add(msg.chat.id)) {
          this.sendTo(msg.chat.id, `You have been added to group <i>${groupToInitTo}</i>!`, "HTML");
        }
      } else {
        this.sendTo(msg.chat.id, "No, I don't think so.");
      }
    };
  };

  public defaultCommandDeactivate = async (msg: TelegramBot.Message) => {
    const arg = this.getArguments(msg.text)[0];
    const deactivated = this.deactivatedCommands.members;
    let s = "";

    if (!arg) {
      s = `Use /${this.getCommand(msg)} /&lt;command&gt; to deactivate/activate command.\n\n${
        deactivated.length === 0
          ? "No deactivated commands found."
          : `<b>Deactivated commands:</b>\n${deactivated.map((v, i) => `${i} ${v}`).join("\n")}`
      }`;
    } else if (Number(arg) < deactivated.length) {
      this.deactivatedCommands.toggle(deactivated[Number(arg)]);
      s = `Command ${deactivated[Number(arg)]} has been reactivated!`;
    } else if (arg.indexOf("/") !== 0) {
      s = `Number not correct, or command not starting with '/'.`;
    } else {
      this.deactivatedCommands.toggle(arg);
      s = `Command ${arg} has been deactivated!`;
    }

    return this.sendTo(msg.chat.id, s, "HTML");
  };

  /**
   * Creates a callback method for a command that requests access to a group of another group.
   *
   * @param requestFor The group that the request is for.
   * @param sendRequestTo The group that receives the request.
   * @param response The response to send to the user directly after sending the request.
   * @param toggleCommand The command that can be used to grant access to the group in question. The command need to look like "/command_CHATID".
   */
  public defaultCommandRequest = (requestFor: Group, sendRequestTo: Group, response: string | undefined, toggleCommand: Command) => {
    return (msg: TelegramBot.Message) => {
      if (response) {
        this.sendTo(msg.chat.id, response);
      }
      this.sendToGroup(
        sendRequestTo,
        `<b>Request for group <i>${requestFor}</i>:</b>\n - ` +
          this.msgInfoToString(msg).join("\n - ") +
          `\n - Is in group: ${requestFor.isMember(msg.chat.id)}\n` +
          `/${toggleCommand}_${this.commandFriendlyUserId(msg.chat.id)}`,
        "HTML"
      );
    };
  };

  /**
   * Create a callback method for a command that adds a certain chat to a group. The command has to be in the form "/<CMD>_<CHATID>", so that the chat ID in question can be retrieved from the command itself.
   *
   * @param requestFor The group.
   * @param responseToNewMember The response for the one using the command.
   *
   * @returns A callback method for a command.
   */
  public defaultCommandToggle = (requestFor: Group, responseToNewMember?: string) => {
    return (msg: TelegramBot.Message) => {
      const userId = this.userIdFromCommand(msg);
      if (!userId) {
        this.sendTo(
          msg.chat.id,
          `Use ${msg.text!.split(" ")[0].split("_")[0]}_CHATID to toggle CHATID for group <i>${requestFor}</i>.`,
          "HTML"
        );
        return;
      }

      if (requestFor.toggle(userId)) {
        this.sendTo(msg.chat.id, `Chat ${userId} has been added to group <i>${requestFor}</i>.`, "HTML");
        if (responseToNewMember) {
          this.sendTo(userId, responseToNewMember);
        }
        return;
      }

      this.sendTo(msg.chat.id, `Chat ${userId} has been removed from group <i>${requestFor}</i>.`, "HTML");
    };
  };

  /**
   * Created a callback method for a simple /start command. A response is sent to the chat, and the chat ID is saved to a group. Another group can also be notified of this.
   *
   * @param response The respone to send to the user.
   * @param addToGroup The group the user should be added to when using the command for the first time.
   * @param alertGroup The group to alert.
   * @param alertMessage The alert message. Using "$CHATID" and "$INFO" in the alert message will replace those tags with the chat ID and info about the user respectively.
   */
  public defaultCommandStart = (response: string, addToGroup: Group, alertGroup?: Group, alertMessage?: string) => {
    return (msg: TelegramBot.Message) => {
      this.sendTo(msg.chat.id, response, "HTML");
      if (addToGroup.add(msg.chat.id) && alertGroup) {
        const message = alertMessage ? alertMessage : `<b>Chat $CHATID has used the start command!</b>\n$INFO`;

        this.sendToGroup(
          alertGroup,
          message
            .split("$CHATID")
            .join(msg.chat.id.toString())
            .split("$INFO")
            .join(
              this.msgInfoToString(msg)
                .map(s => " - " + s)
                .join("\n")
            ),
          "HTML"
        );
      }
    };
  };

  public defaultCommandGroups = () => {
    return (msg: TelegramBot.Message) => {
      const n = Number(this.getArguments(msg.text)[0]);

      if (n >= 0 && n < this.groups.length) {
        const group = this.groups[n];
        this.groupToUserInfo(group)
          .then(a => {
            const message =
              a.length === 0
                ? `No chats in group <i>${group.name}</i>.`
                : `<b>Chats in group <i>${group.name}</i></b>:\n${a.map(s => ` - ${s}`).join("\n")}`;
            this.sendTo(msg.chat.id, message, "HTML");
          })
          .catch(e => this.sendError(e));
      } else {
        this.sendTo(
          msg.chat.id,
          this.groups.length > 0
            ? `<b>Available groups</b>:\n${this.groups.map((g, i) => `${i} ${g} (${g.members.length})`).join("\n")}`
            : "No groups available...",
          "HTML"
        );
      }
    };
  };
}

export default TGBotWrapper;
