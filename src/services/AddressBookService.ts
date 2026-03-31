import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@sovn:address_book';

export interface AddressBookEntry {
  id: string;
  name: string;
  address: string;
  createdAt: number;
}

async function load(): Promise<AddressBookEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function save(entries: AddressBookEntry[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export async function getAll(): Promise<AddressBookEntry[]> {
  return load();
}

export async function addEntry(name: string, address: string): Promise<AddressBookEntry> {
  const entries = await load();
  const entry: AddressBookEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: name.trim(),
    address: address.trim(),
    createdAt: Date.now(),
  };
  await save([...entries, entry]);
  return entry;
}

export async function updateEntry(id: string, name: string): Promise<void> {
  const entries = await load();
  await save(entries.map(e => e.id === id ? { ...e, name: name.trim() } : e));
}

export async function removeEntry(id: string): Promise<void> {
  const entries = await load();
  await save(entries.filter(e => e.id !== id));
}

export async function findByAddress(address: string): Promise<AddressBookEntry | null> {
  const entries = await load();
  return entries.find(e => e.address === address) ?? null;
}
