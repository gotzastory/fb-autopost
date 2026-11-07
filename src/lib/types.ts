export interface Group {
  id: string;
  name: string;
  url: string;
  cover?: string;
  avatar?: string;
  managed?: boolean;
}

export interface Identity {
  type: 'profile' | 'page';
  name: string;
  avatar?: string;
  id?: string | null;
  url?: string | null;
}

export interface Profile {
  id?: string;
  name?: string;
  avatar?: string;
}

/** Reply shape shared by the engine's message handlers. */
export interface EngineReply {
  success?: boolean;
  error?: string;
  cancelled?: boolean;
  accountChanged?: boolean;
  alreadyActive?: boolean;
  activePageId?: string;
  userId?: string;
  jobId?: string;
  profile?: Profile;
  group?: Partial<Group>;
  groups?: Partial<Group>[];
  pages?: Partial<Identity>[];
  covers?: { pass1Loaded?: number; pass2Loaded?: number };
}

export const send = (message: object) => chrome.runtime.sendMessage(message) as Promise<EngineReply | undefined>;

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
