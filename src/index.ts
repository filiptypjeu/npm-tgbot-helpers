import TelegramBot from "node-telegram-bot-api";
import os from "os";
import readLastLines from "read-last-lines";
import sanitizeHtml from "sanitize-html";
import moment from "moment";
import momentDurationFormatSetup from "moment-duration-format";
import { Group } from "./Group";
export * from "./Group";
import { BooleanVariable, ILocalStorage, Variable } from "persistance";
import { readdirSync } from "fs";
momentDurationFormatSetup(moment as any);

/**
 * @todo
 * - Add command for getting user info: name, id, groups etc.
 * - Follow log
 * - Add toggle/request setup to Group?
 */

export interface ILogger {
  info: (message: any) => void;
  error: (message: any) => void;
}

export interface ITGBotWrapperOptions {
  telegramBot: TelegramBot;
  username: string;
  localStorage: ILocalStorage;
  variables?: Variable<any>[];
  defaultCommands?: {
    init?: Command;
    uptime?: Command;
    deactivate?: Command;
    help?: Command;
    ip?: Command;
    var?: Command;
    groups?: Command;
    chatInfo?: Command;
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
    banToggle?: Command;
    logs?: {
      command: Command;
      path: string | string[];
    };
  };
  groups?: Group[];
  sudoGroup: Group;
  commandLogger?: ILogger;
  botLogger?: ILogger;
  errorLogger?: ILogger;
  defaultAccessDeniedMessage?: string;
  defaultPrivateOnlyMessage?: string;
  defaultCommandDeactivatedMessage?: string;
}

export interface ICommand {
  command: Command;
  regexp?: RegExp;
  group?: Group | Group[];
  privateOnly?: boolean;
  matchBeginningOnly?: boolean;
  hide?: boolean;
  description?: string;
  chatAcion?: TelegramBot.ChatAction;
  accessDeniedMessage?: string;
  callback: (msg: TelegramBot.Message) => void;
}

export interface IToggleCommand {
  // The command used to toggle chat membership in this group
  command: Command;
  // Description of the toggle command
  description?: string;
  // The response to the user when added to the group
  responseWhenAdded?: string;
}

export interface IRequestCommand {
  // The command for requesting access to the group
  command: Command;
  // The immediate response given to a request
  response?: string;
  // If only private chats can request access or not
  privateOnly?: boolean;
  // Description of the request command
  description?: string;
  // The group to send the request to
  sendTo: Group;
}

export interface IMessageInfo {
  command?: string;
  commandBase?: string;
  commandSuffix?: string;
  commandBotName?: string;
  text?: string;
  arguments: string[];
}

type CommandCallback = (msg: TelegramBot.Message) => void | Promise<void>;
type Command = string;
export type ChatID = string | number;

export class TGBotWrapper {
  public readonly bot: TelegramBot;
  private readonly ls: ILocalStorage;

  public readonly username: string;
  public readonly commands: ICommand[] = [];
  public readonly groups: Group[] = [];

  public readonly sudoEchoVar: BooleanVariable;
  public readonly sudoLogVar: BooleanVariable;
  public readonly variables: Variable<any>[] = [];

  public readonly startTime: Date;
  public readonly deactivatedCommands: Group;
  private readonly sudoGroup: Group;
  private readonly bannedUsers: Group;

  public commandLogger: ILogger | undefined;
  public botLogger: ILogger | undefined;
  public errorLogger: ILogger | undefined;

  public defaultAccessDeniedMessage: string;
  public defaultCommandDeactivatedMessage: string;
  public defaultPrivateOnlyMessage: string;

  private readonly chatInfoCommand: string | undefined;

  constructor(o: ITGBotWrapperOptions) {
    this.bot = o.telegramBot;
    if (!this.bot.isPolling()) {
      this.bot.startPolling();
    }

    this.username = o.username;
    this.startTime = new Date();
    this.ls = o.localStorage;

    this.sudoEchoVar = new BooleanVariable("sudoEcho", false, this.ls);
    this.sudoLogVar = new BooleanVariable("sudoLog", false, this.ls);
    this.deactivatedCommands = new Group("deactivatedCommands", this.ls);
    this.bannedUsers = new Group(
      "banned",
      this.ls,
      o.defaultCommands?.banToggle ? { command: o.defaultCommands.banToggle, description: "Ban users." } : undefined
    );

    this.sudoGroup = o.sudoGroup;
    this.commandLogger = o.commandLogger;
    this.botLogger = o.botLogger;
    this.errorLogger = o.errorLogger;

    this.defaultAccessDeniedMessage = o.defaultAccessDeniedMessage || "You dont have access to this command.";
    this.defaultCommandDeactivatedMessage = o.defaultCommandDeactivatedMessage || "This command has been deactivated.";
    this.defaultPrivateOnlyMessage = o.defaultPrivateOnlyMessage || "The command can only be used in a private chat.";

    // Add all groups
    const groups = (o.groups || []).concat([this.bannedUsers]);

    for (const group of groups) {
      this._addGroup(group);

      const r = group.requestCommand;
      const t = group.toggleCommand;

      // Add request and group toggle commands
      if (r)
        this._addCommand({
          command: r.command,
          chatAcion: r.response ? "typing" : undefined,
          privateOnly: r.privateOnly,
          description: r.description,
          callback: this.defaultCommandRequest(group, r.sendTo, r.response, t?.command),
        });

      if (t)
        this._addCommand({
          command: t.command,
          chatAcion: "typing",
          group: r?.sendTo || this.sudoGroup,
          matchBeginningOnly: true,
          description: t.description,
          callback: this.defaultCommandToggle(t.command, group, t.responseWhenAdded),
        });
    }

    // Add default commands

    if (o.defaultCommands?.deactivate) {
      this._addCommand({
        command: o.defaultCommands.deactivate,
        group: o.sudoGroup,
        chatAcion: "typing",
        description: "Deactivates or reactivates a given command.",
        callback: this.defaultCommandDeactivate(),
      });
    }

    if (o.defaultCommands?.help) {
      this._addCommand({
        command: o.defaultCommands.help,
        chatAcion: "typing",
        callback: this.defaultCommandHelp(),
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

    if (o.defaultCommands?.start) {
      const c = o.defaultCommands.start;
      this._addCommand({
        command: "start",
        chatAcion: "typing",
        callback: this.defaultCommandStart(c.greeting, c.addToGroup, o.sudoGroup),
        description: c.description,
      });
    }

    if (o.defaultCommands?.uptime) {
      this._addCommand({
        command: o.defaultCommands.uptime,
        group: o.sudoGroup,
        chatAcion: "typing",
        description: "Get the bot and system uptime.",
        callback: this.defaultCommandUptime(),
      });
    }

    if (o.defaultCommands?.ip) {
      this._addCommand({
        command: o.defaultCommands.ip,
        group: o.sudoGroup,
        chatAcion: "typing",
        description: "Get the IP of the system.",
        callback: this.defaultCommandIP(),
      });
    }

    if (o.defaultCommands?.commands) {
      const c = o.defaultCommands.commands;
      this._addCommand({
        command: c.command,
        group: c.availableFor,
        chatAcion: "typing",
        description: c.description,
        callback: this.defaultCommandCommands(),
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

    if (o.defaultCommands?.chatInfo) {
      this.chatInfoCommand = o.defaultCommands.chatInfo;
      this._addCommand({
        command: o.defaultCommands.chatInfo,
        group: o.sudoGroup,
        privateOnly: true,
        matchBeginningOnly: true,
        chatAcion: "typing",
        description: "Gives info about a certain chat that uses the bot.",
        callback: this.defaultCommandChatInfo(),
      });
    }

    if (o.defaultCommands?.logs) {
      const c = o.defaultCommands.logs;
      this._addCommand({
        command: c.command,
        group: o.sudoGroup,
        privateOnly: true,
        chatAcion: "typing",
        callback: this.defaultCommandLogs(c.path),
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
          this.botLogger?.info(msg);
        }

        if (this.sudoEchoVar.get()) {
          this.sendTo(msg.chat.id, JSON.stringify(msg, null, 4));
        }
      }
    });

    this.onInit();
  }

  public addCustomCommands(commands: ICommand[]) {
    for (const c of commands) {
      this._addCommand(c);
    }

    this.botLogger?.info(`Added ${commands.length} custom commands.`);
  }

  private async onInit() {
    const username = this.username || "UNKNWON_BOT";

    const msg = `${username} initialized with ${this.commands.length} commands, ${this.groups.length} groups and ${this.variables.length} variables.`;
    this.botLogger?.info(msg);
    this.sendToGroup(this.sudoGroup, msg).catch(() => {});
  }

  private canRunCommand(msg: TelegramBot.Message, c: ICommand): boolean {
    let log = "ok";
    let message = "";
    const hidden = c.hide || false;

    // Do not give away the existence of hidden commands

    // Check if user is in the correct group
    if (c.group && !Group.isMember(c.group, msg.chat.id)) {
      message = hidden ? c.accessDeniedMessage || "" : c.accessDeniedMessage || this.defaultAccessDeniedMessage;
      log = "denied";

      // Check if the command is deactivated
    } else if (!this.sudoGroup.isMember(msg.chat.id) && this.deactivatedCommands.isMember(`/${c}`)) {
      if (!hidden) message = this.defaultCommandDeactivatedMessage;
      log = "deactivated";

      // Check if the command has to be used in a private chat
    } else if (c.privateOnly && msg.chat.type !== "private") {
      if (!hidden) message = this.defaultPrivateOnlyMessage;
      log = "private";

      // Check if user is banned
    } else if (this.bannedUsers.isMember(msg.chat.id)) {
      log = "banned";
    }

    // Log the command and send message to the user
    this.commandLogger?.info(`${this.chatInfo(msg.from!)} : /${c.command} [${log}]`);
    if (message) this.sendTo(msg.chat.id, message);

    return log === "ok";
  }

  private _addCommand(command: ICommand) {
    if (this.commands.find(c => c.command === command.command)) {
      throw new Error(`Duplicate command "${command.command}"`);
    }

    this.bot.onText(this.commandRegExp(command, this.username), msg => {
      if (!this.canRunCommand(msg, command)) return;
      if (command.chatAcion) this.bot.sendChatAction(msg.chat.id, command.chatAcion);
      return command.callback(msg);
    });

    this.commands.push(command);
  }

  private _addGroup(group: Group): void {
    if (this.groups.find(g => g.name === group.name)) {
      throw new Error(`Duplicate group "${group}"`);
    }

    this.groups.push(group);
  }

  private _addVariable(variable: Variable<any>): void {
    if (this.variables.find(v => v.name === variable.name)) {
      throw new Error(`Duplicate variable "${variable.name}"`);
    }

    this.variables.push(variable);
  }

  /**
   * Creates a RegExp for a command.
   */
  public commandRegExp(c: ICommand, botName: string = ""): RegExp {
    return c.matchBeginningOnly
      ? new RegExp(`^/${c.command}[a-zA-Z0-9_]*(?:$|@${botName}\\b|[^a-zA-Z0-9_@])`)
      : new RegExp(`^/${c.command}(?:$|@${botName}\\b|[^a-zA-Z0-9_@])`);
  }

  /**
   * Orders the commands by the group that can use them.
   */
  public commandsByGroup(): Map<Group | undefined, ICommand[]> {
    const m = new Map<Group | undefined, ICommand[]>();
    for (const cmd of this.commands) {
      const groups = Array.isArray(cmd.group) ? cmd.group : [cmd.group];
      groups.forEach(g => m.set(g, (m.get(g) || []).concat(cmd)));
    }
    return m;
  }

  /**
   * Get command used in a message.
   */
  public getCommand(msg: TelegramBot.Message): Command {
    if (!msg.entities || msg.entities[0].offset !== 0 || msg.entities[0].type !== "bot_command") {
      return "";
    }
    return msg.text!.slice(1, msg.entities[0].length).split("@")[0];
  }

  public handleMessage(msg: TelegramBot.Message): IMessageInfo {
    let commandLength = 0;
    if (msg.entities) {
      const entity = msg.entities[0];
      if (entity && entity.type === "bot_command" && entity.offset === 0) {
        commandLength = entity.length;
      }
    }

    const info: IMessageInfo = {
      arguments: [],
    };

    if (!msg.text) {
      return info;
    }

    const command = msg.text.substring(0, commandLength).trim();
    if (command) {
      info.command = command;
      info.commandBase = command.split("_")[0].slice(1);
      info.arguments = msg.text
        .slice(commandLength)
        .split("\n")[0]
        .split(" ")
        .filter(s => s);

      const suffix = command.split("_")[1]?.split("@")[0];
      if (suffix) {
        info.commandSuffix = suffix;
      }

      const botname = command.split("@")[1];
      if (botname) {
        info.commandBotName = botname;
      }
    }

    const text = msg.text.slice(commandLength).trim();
    if (text) {
      info.text = text;
    }

    return info;
  }

  public async groupToChats(group: Group): Promise<TelegramBot.Chat[]> {
    return Promise.all(group.members.map(chat_id => this.bot.getChat(chat_id)));
  }

  public async groupToChatInfos(group: Group): Promise<string[]> {
    const chats = await this.groupToChats(group);
    return chats.map(c => this.chatInfo(c, true, true));
  }

  /**
   * Make a user id into a string that can be used as a command.
   */
  public commandify(chat_id: ChatID): string {
    return chat_id.toString().replace("-", "m");
  }

  public decommandify(chat_id: string): ChatID | undefined {
    const n = Number(chat_id?.replace("m", "-"));
    return Number.isSafeInteger(n) ? n : undefined;
  }

  /**
   * 1. User => name and username etc.
   * 2. Chat, private => name and username etc.
   * 3. Chat, not private => title and type etc.
   */
  public chatInfo(
    chatOrUser: TelegramBot.Chat | TelegramBot.User,
    allInfo: boolean = false,
    tags: boolean = false,
    noNameIfPrivateChat: boolean = false
  ): string {
    const a: (string | undefined)[] = [];

    const i = tags ? "<i>" : "";
    const ii = tags ? "</i>" : "";
    const b = tags ? "<b>" : "";
    const bb = tags ? "</b>" : "";

    const type = (chatOrUser as TelegramBot.Chat).type;

    // Chat that is not private
    if (type && (type !== "private" || noNameIfPrivateChat)) {
      const c = chatOrUser as TelegramBot.Chat;
      a.push(c.title ? `${b}${c.title}${bb}` : "");
      a.push(`[${c.type}]`);
      if (allInfo) {
        a.push(c.invite_link ? `${i}${c.invite_link}${ii}` : "");
      }

      // User or private chat
    } else {
      const u = chatOrUser as TelegramBot.User;
      a.push(`${b}${u.first_name}${u.last_name ? " " + u.last_name : ""}${bb}`);
      a.push(u.username ? `${i}@${u.username}${ii}` : "");
      if (allInfo) {
        a.push(u.is_bot ? `(BOT)` : "");
        a.push(u.language_code ? `[${u.language_code}]` : "");
      }
    }

    return a
      .filter(s => s)
      .join(" ")
      .trim();
  }

  private getSendOptions(
    param: TelegramBot.ParseMode | TelegramBot.SendMessageOptions | undefined,
    silent: boolean = false,
    noPreview: boolean = false
  ): TelegramBot.SendMessageOptions {
    return typeof param === "object"
      ? param
      : {
          parse_mode: param || "HTML",
          disable_notification: silent,
          disable_web_page_preview: noPreview,
        };
  }

  /**
   * Send a message to a chat. The message is automatically split into several messages if too long.
   *
   * @param chat_id The chat ID to send the message to.
   * @param text The text to send.
   * @param options Message options.
   */
  public async sendTo(chat_id: ChatID, text: string, options?: TelegramBot.SendMessageOptions): Promise<void>;
  /**
   * Send a message to a chat. The message is automatically split into several messages if too long.
   *
   * @param chat_id The chat ID to send the message to.
   * @param text The text to send.
   * @param parseMode How to parse the text.
   * @param silent True = no notification is shown for the receiver.
   * @param noPreview  True = no web page preview is shown for the receiver.
   */
  public async sendTo(
    chat_id: ChatID,
    text: string,
    parseMode?: TelegramBot.ParseMode,
    silent?: boolean,
    noPreview?: boolean
  ): Promise<void>;
  public async sendTo(
    chat_id: ChatID,
    text: string,
    param?: TelegramBot.ParseMode | TelegramBot.SendMessageOptions,
    silent?: boolean,
    noPreview?: boolean
  ) {
    const sendOptions = this.getSendOptions(param, silent, noPreview);
    const textToSend = sendOptions.parse_mode === "HTML" ? sanitizeHtml(text, { allowedTags: ["b", "i", "code"] }) : text;
    try {
      return await this.bot.sendMessage(chat_id, textToSend, sendOptions);
    } catch (e: any) {
      if (e.code !== "ETELEGRAM") return this.errorLogger?.error(e);
      if (e.response.body.description !== "Bad Request: message is too long")
        this.sendError(
          `Error code: ${e.code}, msg_length: ${text.length}, ok: ${e.response.body.ok}, error_code: ${e.response.body.error_code}, description: ${e.response.body.description}`
        );

      const splitText = text.split("\n");
      if (splitText.length <= 1) this.sendError(`Message to chat ${chat_id} too long (${text.length} characters)...`);
      await this.sendTo(
        chat_id,
        splitText
          .slice(0, Math.round(splitText.length / 2))
          .join("\n")
          .trim(),
        sendOptions
      );
      await this.sendTo(
        chat_id,
        splitText
          .slice(Math.round(splitText.length / 2))
          .join("\n")
          .trim(),
        sendOptions
      );
    }
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
  public async sendToGroup(
    group: Group,
    text: string,
    parseMode?: TelegramBot.ParseMode,
    silent?: boolean,
    noPreview?: boolean
  ): Promise<void[]>;
  public async sendToGroup(
    group: Group,
    text: string,
    param?: TelegramBot.ParseMode | TelegramBot.SendMessageOptions,
    silent?: boolean,
    noPreview?: boolean
  ) {
    const sendOptions = this.getSendOptions(param, silent, noPreview);
    return Promise.all(group.members.map(id => this.sendTo(id, text, sendOptions)));
  }

  public async sendError(e: any) {
    this.botLogger?.error(e);
    return this.sendToGroup(this.sudoGroup, e ? e.toString().slice(0, 3000) : "Undefined error");
  }

  /**
   * Callback method for a command that respons with the current uptime of the bot and OS.
   */
  private defaultCommandUptime = (): CommandCallback => msg => {
    const f = "d [days], h [hours], m [minutes and] s [seconds]";
    return this.sendTo(
      msg.chat.id,
      `<b>Bot uptime</b>: <i>${moment.duration(Date.now() - this.startTime.valueOf()).format(f)}</i>\n<b>OS uptime</b>: <i>${moment
        .duration(os.uptime() * 1000)
        .format(f)}</i>`
    );
  };

  /**
   * Callback method for a command that respons with the IP address(es) of the bot.
   */
  private defaultCommandIP = (): CommandCallback => msg => {
    const ifaces = os.networkInterfaces();
    const ips: string[] = [];

    Object.keys(ifaces).forEach(ifname => {
      let alias = 0;
      ifaces[ifname]!.forEach(iface => {
        // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
        if (iface.family !== "IPv4" || iface.internal) {
          return;
        }

        ips.push(`${ifname}${alias ? ":" + alias : ""} ${iface.address}`);

        ++alias;
      });
    });

    return this.sendTo(msg.chat.id, ips.length ? ips.join("\n") : "No IP addresses found.");
  };

  private defaultCommandCommands = (): CommandCallback => msg => {
    this.commandsByGroup().forEach((cmds, group) => {
      if (!group || group.isMember(msg.chat.id)) {
        this.sendTo(
          msg.chat.id,
          `<b>Commands accessible to ${group ? `group <i>${group}</i>` : "everybody"}:</b>\n` +
            cmds
              .map(cmd => `${cmd.hide ? "(" : ""}/${cmd.command}${cmd.privateOnly ? "*" : ""}${cmd.hide ? ")" : ""}`)
              .sort()
              .join("\n")
        );
      }
    });
  };

  private defaultCommandHelp = (): CommandCallback => msg => {
    return this.sendTo(
      msg.chat.id,
      this.commands
        .filter(cmd => (cmd.group ? Group.isMember(cmd.group, msg.chat.id) : !cmd.hide))
        .map(cmd => `/${cmd.command}${cmd.privateOnly ? "*" : ""}${cmd.description ? ":  " + cmd.description : ""}`)
        .sort()
        .join("\n\n")
    );
  };

  private defaultCommandVar = (): CommandCallback => msg => {
    const info = this.handleMessage(msg);
    const args = info.arguments;

    // Give all variables
    if (!args[0]) {
      return this.sendTo(
        msg.chat.id,
        "<b>Available variables:</b>\n<code>" + this.variables.map((V, i) => `${i} ${V.toString()}`).join("\n") + "</code>"
      );
    }

    // Handle invalid variable number
    const n = Number(args[0]);
    const v = this.variables[n];
    if (!v) {
      return this.sendTo(msg.chat.id, `Variable ${args[0]} does not exist.`);
    }

    const value = args[1];

    // Do nothing if a value is not provided
    if (!value) {
      // Reset variable value
    } else if (value === "#" || value.toLowerCase() === "default") {
      v.clear();

      // Set variable
    } else {
      // The value should be interpreted as everything past the first argument, not only the second argument
      const str = info.text?.slice(args[0].length).trim();
      if (str) v.setWithString(str);
    }

    // Get variable
    return this.sendTo(msg.chat.id, `Variable ${n}: <code>${v.toString()}</code>`);
  };

  /**
   * Creates a callback method for a command that sends a message to a specific chat. The command is expected to be used like "/command_<CHATID> <MESSAGE>". The received message can be formatted freely.
   *
   * @param messageFormatter Function that formats the message to be sent. Can be used to for example add a header or footer to the message.
   */
  private defaultCommandSendTo =
    (
      messageFormatter: (messageToFormat: TelegramBot.Message) => string,
      emptyResponse?: string,
      successResponse?: string,
      noIdResponse?: string,
      noChatResponse?: string
    ): CommandCallback =>
    msg => {
      const info = this.handleMessage(msg);

      // No text provided
      if (!info.text) {
        return this.sendTo(msg.chat.id, emptyResponse || "No text provided...");
      }

      // No chat id provided
      const chat_id = this.decommandify(info.commandSuffix || "");
      if (!chat_id) {
        return this.sendTo(msg.chat.id, noIdResponse || `No chat ID found within the command...`);
      }

      this.bot
        .getChat(chat_id)
        .then(chat => {
          this.sendTo(msg.chat.id, successResponse || `Message sent to chat ${chat_id}!`);
          this.sendTo(chat.id, messageFormatter(msg) || info.text!);
        })
        .catch(() => {
          this.sendTo(msg.chat.id, noChatResponse || `No chat with ID ${chat_id} is available to the bot...`);
          return;
        });

      return;
    };

  /**
   * Creates a callback method for a command that let's a user send a message to all members of a group. It is used by writing the message after the command, i.e. "/command <message>".
   */
  private defaultCommandSendToGroup =
    (
      group: Group,
      messageFormatter: (messageToFormat: TelegramBot.Message) => string,
      emptyResponse?: string,
      successResponse?: string
    ): CommandCallback =>
    msg => {
      const text = this.handleMessage(msg).text;
      if (!text) {
        if (emptyResponse) this.sendTo(msg.chat.id, emptyResponse);
      } else {
        this.sendToGroup(group, messageFormatter(msg) || text);
        this.sendTo(msg.chat.id, successResponse || `Message sent to group <i>${group}</i>!`);
      }
    };

  private defaultCommandLogs =
    (path: string | string[]): CommandCallback =>
    async msg => {
      const files = [path].flat().flatMap(p =>
        readdirSync(p)
          .filter(f => !f.startsWith("."))
          .map(f => `${p}/${f}`)
      );
      if (!files.length) {
        this.sendTo(msg.chat.id, "No log files found.");
        return;
      }

      const args = this.handleMessage(msg).arguments;
      const fileName = files[Number(args[0]) - 1];
      if (fileName) {
        readLastLines
          .read(fileName, Number(args[1]) || 10)
          .then(s => this.sendTo(msg.chat.id, s ? `<b>${fileName}</b>\n${s}` : `File ${fileName} is empty.`))
          .catch(e => this.sendError(e));
        return;
      }

      this.sendTo(msg.chat.id, `<b>Available logs</b>\n${files.map((f, i) => `  ${i + 1} <i>${f}</i>`).join("\n")}`);
    };

  /**
   * Creates a callback method for a command that reads the last lines from a certain file and sends them to the chat. The amount of lines can be given as an argument when using the command.
   */
  private defaultCommandLog =
    (logPath: string): CommandCallback =>
    msg => {
      const n = Number(this.handleMessage(msg).arguments[0]);
      readLastLines
        .read(logPath, n || 10)
        .then(s => this.sendTo(msg.chat.id, s ? `<b>${logPath}</b>\n${s}` : `File ${logPath} is empty.`))
        .catch(e => this.sendError(e));
    };

  /**
   * Creates a callback method for a command that adds a chat to a certain gruop. Useful when for example starting the bot for the first time and adding yourself as the first admin.
   *
   * @param groupToInitTo The group to add the chat to.
   */
  private defaultCommandInit =
    (groupToInitTo: Group): CommandCallback =>
    msg => {
      const userIds = groupToInitTo.members;
      if (!userIds.length) {
        if (groupToInitTo.add(msg.chat.id)) {
          this.sendTo(msg.chat.id, `You have been added to group <i>${groupToInitTo}</i>!`);
        }
      } else {
        this.sendTo(msg.chat.id, "No, I don't think so.");
      }
    };

  private defaultCommandDeactivate = (): CommandCallback => msg => {
    const arg = this.handleMessage(msg).arguments[0];
    const deactivated = this.deactivatedCommands.members;

    // Give all deactivated commands
    if (!arg) {
      return this.sendTo(
        msg.chat.id,
        `Use "/${this.getCommand(msg)} &lt;command&gt;" to deactivate/activate certain commands.\n\n${
          deactivated.length === 0
            ? "No deactivated commands found."
            : `<b>Deactivated commands:</b>\n${deactivated.map((v, i) => `${i} ${v}`).join("\n")}`
        }`
      );
    }

    const c = deactivated[Number(arg)];
    if (c) {
      this.deactivatedCommands.toggle(c);
      return this.sendTo(msg.chat.id, `Command ${c} has been reactivated!`);
    }

    if (arg.startsWith("/")) {
      return this.sendTo(msg.chat.id, `Command ${arg} has been ${this.deactivatedCommands.toggle(arg) ? "deactivated" : "reactivated"}!`);
    }

    return this.sendTo(msg.chat.id, `Number not correct, or command not starting with '/'.`);
  };

  /**
   * Creates a callback method for a command that requests access to a group of another group.
   *
   * @param requestFor The group that the request is for.
   * @param sendRequestTo The group that receives the request.
   * @param response The response to send to the user directly after sending the request.
   * @param toggleCommand The command that can be used to grant access to the group in question. The command need to look like "/command_CHATID".
   */
  private defaultCommandRequest =
    (requestFor: Group, sendRequestTo: Group, response: string | undefined, toggleCommand?: Command): CommandCallback =>
    msg => {
      const id = msg.chat.id;
      if (response) this.sendTo(id, response);
      if (requestFor.isMember(id)) return;
      const rows = [
        `<b>Request for group <i>${requestFor}</i>:</b>`,
        ` - User: ${this.chatInfo(msg.from!, true, true)}`,
        ` - Chat: ${this.chatInfo(msg.chat, true, true, true)}`,
        ` - Is in group: <code>${requestFor.isMember(msg.chat.id)}</code>`,
      ];
      if (toggleCommand) rows.push(`Toggle: /${toggleCommand}_${this.commandify(id)}`);

      this.sendToGroup(sendRequestTo, rows.join("\n"));
    };

  /**
   * Create a callback method for a command that adds a certain chat to a group. The command has to be in the form "/<CMD>_<CHATID>", so that the chat ID in question can be retrieved from the command itself.
   *
   * @param requestFor The group.
   * @param responseToNewMember The response for the one using the command.
   *
   * @returns A callback method for a command.
   */
  private defaultCommandToggle =
    (command: Command, requestFor: Group, responseToNewMember?: string): CommandCallback =>
    async msg => {
      const info = this.handleMessage(msg);
      const userId = this.decommandify(info.commandSuffix || "");
      if (!userId) {
        const chats = await this.groupToChats(requestFor);
        this.sendTo(
          msg.chat.id,
          `Use ${info.commandBase}_CHATID to toggle CHATID for group <i>${requestFor}</i>. Current users in group:\n${chats
            .map(c => ` - ${this.chatInfo(c, true, true)} /${command}_${c.id}`)
            .join("\n")}`
        );
        return;
      }

      if (requestFor.toggle(userId)) {
        this.sendTo(msg.chat.id, `Chat ${userId} has been added to group <i>${requestFor}</i>.`);
        if (responseToNewMember) {
          this.sendTo(userId, responseToNewMember);
        }
        return;
      }

      return this.sendTo(msg.chat.id, `Chat ${userId} has been removed from group <i>${requestFor}</i>.`);
    };

  /**
   * Created a callback method for a simple /start command. A response is sent to the chat, and the chat ID is saved to a group. Another group can also be notified of this.
   *
   * @param response The respone to send to the user.
   * @param addToGroup The group the user should be added to when using the command for the first time.
   * @param alertGroup The group to alert.
   */
  private defaultCommandStart =
    (response: string, addToGroup?: Group, alertGroup?: Group): CommandCallback =>
    msg => {
      const id = msg.chat.id;
      this.sendTo(id, response);

      if (addToGroup && addToGroup.add(id) && alertGroup) {
        const c = this.handleMessage(msg).commandBase;
        const rows = [
          `<b>A new user have used the /${c} command</b>`,
          ` - User: ${this.chatInfo(msg.from!, true, true)}`,
          ` - Chat: ${this.chatInfo(msg.chat, true, true, true)}`,
        ];

        const groups = this.groups.filter(g => g.toggleCommand?.command);
        if (groups.length) {
          rows.push("", "Group toggles:");
          groups.forEach(g => rows.push(` - <i>${g.name}</i>: /${g.toggleCommand?.command}_${this.commandify(id)}`));
        }
        this.sendToGroup(alertGroup, rows.join("\n"));
      }
    };

  private defaultCommandGroups = (): CommandCallback => msg => {
    const group = this.groups[Number(this.handleMessage(msg).arguments[0])];

    if (group) {
      this.groupToChatInfos(group)
        .then(a => {
          const message =
            a.length === 0
              ? `No chats in group <i>${group}</i>.`
              : `<b>Chats in group <i>${group}</i></b>:\n${a.map(s => ` - ${s}`).join("\n")}`;
          this.sendTo(msg.chat.id, message);
        })
        .catch(e => this.sendError(e));
    } else {
      this.sendTo(
        msg.chat.id,
        this.groups.length > 0
          ? `<b>Available groups</b>:\n${this.groups.map((g, i) => `${i} <i>${g}</i> (${g.members.length})`).join("\n")}`
          : "No groups available..."
      );
    }
  };

  /**
   * Create a callback method for a command that gives the current info about a chat that uses the bot.
   *
   * @returns A callback method for a command.
   */
  private defaultCommandChatInfo = (): CommandCallback => async msg => {
    const info = this.handleMessage(msg);
    const chat_id = this.decommandify(info.commandSuffix || "");
    if (!chat_id) {
      this.sendTo(msg.chat.id, `Use ${info.commandBase}_CHATID to see info about a user.`);
      return;
    }

    const chatInfo = this.chatInfo(await this.bot.getChat(chat_id), true, true);
    const rows = [
      `<b>User/chat info</b>`,
      chatInfo,
    ];

    const groups = this.groups.filter(g => g.toggleCommand?.command);
    if (groups.length) {
      rows.push("", "Group toggles:");
      groups.forEach(g => rows.push(` - <i>${g.name}</i>: /${g.toggleCommand?.command}_${this.commandify(chat_id)}`));
    }

    return this.sendTo(msg.chat.id, rows.join("\n"));
  };

  public defaultCommands = {
    uptime: this.defaultCommandUptime,
    ip: this.defaultCommandIP,
    commands: this.defaultCommandCommands,
    help: this.defaultCommandHelp,
    var: this.defaultCommandVar,
    sendTo: this.defaultCommandSendTo,
    sendToGroup: this.defaultCommandSendToGroup,
    log: this.defaultCommandLog,
    logs: this.defaultCommandLogs,
    init: this.defaultCommandInit,
    deactivate: this.defaultCommandDeactivate,
    request: this.defaultCommandRequest,
    toggle: this.defaultCommandToggle,
    start: this.defaultCommandStart,
    groups: this.defaultCommandGroups,
    chatInfo: this.defaultCommandChatInfo,
  };
}

export default TGBotWrapper;
