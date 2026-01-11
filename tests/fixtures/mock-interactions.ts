// Mock Discord.js interactions for command testing
import type {
  ChatInputCommandInteraction,
  GuildMember,
  User,
  Guild,
  TextChannel,
} from 'discord.js';

export function createMockUser(userId: string, username: string): Partial<User> {
  return {
    id: userId,
    username,
    discriminator: '0',
    bot: false,
    toString: () => `<@${userId}>`,
  };
}

export function createMockMember(
  userId: string,
  username: string,
  roleIds: string[] = []
): Partial<GuildMember> {
  const user = createMockUser(userId, username);
  return {
    id: userId,
    user: user as User,
    roles: {
      cache: new Map(roleIds.map(id => [id, { id, name: `Role-${id}` } as any])),
      has: (roleId: string) => roleIds.includes(roleId),
    } as any,
  };
}

export function createMockInteraction(
  userId: string,
  username: string,
  channelId: string,
  guildId: string,
  roleIds: string[] = []
): Partial<ChatInputCommandInteraction> {
  const user = createMockUser(userId, username);
  const member = createMockMember(userId, username, roleIds);
  
  const replies: any[] = [];
  
  return {
    user: user as User,
    member: member as GuildMember,
    channelId,
    guildId,
    guild: {
      id: guildId,
      members: {
        fetch: async () => member as GuildMember,
      },
    } as any,
    options: {
      getString: () => null,
      getNumber: () => null,
      getInteger: () => null,
      getBoolean: () => null,
      getUser: () => null,
    } as any,
    deferred: false,
    replied: false,
    reply: async (options: any) => {
      replies.push({ type: 'reply', options });
      return {} as any;
    },
    followUp: async (options: any) => {
      replies.push({ type: 'followUp', options });
      return {} as any;
    },
    _testReplies: replies, // For test assertions
  };
}
