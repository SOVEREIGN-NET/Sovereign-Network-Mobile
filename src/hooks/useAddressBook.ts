import { useCallback, useEffect, useState } from 'react';
import * as AddressBookService from '../services/AddressBookService';
import type { AddressBookEntry } from '../services/AddressBookService';

export type { AddressBookEntry };

export interface UseAddressBookReturn {
  entries: AddressBookEntry[];
  add: (name: string, address: string) => Promise<AddressBookEntry>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  findByAddress: (address: string) => AddressBookEntry | undefined;
}

export function useAddressBook(): UseAddressBookReturn {
  const [entries, setEntries] = useState<AddressBookEntry[]>([]);

  useEffect(() => {
    AddressBookService.getAll().then(setEntries);
  }, []);

  const add = useCallback(async (name: string, address: string) => {
    const entry = await AddressBookService.addEntry(name, address);
    setEntries(prev => [...prev, entry]);
    return entry;
  }, []);

  const remove = useCallback(async (id: string) => {
    await AddressBookService.removeEntry(id);
    setEntries(prev => prev.filter(e => e.id !== id));
  }, []);

  const rename = useCallback(async (id: string, name: string) => {
    await AddressBookService.updateEntry(id, name);
    setEntries(prev => prev.map(e => e.id === id ? { ...e, name } : e));
  }, []);

  const findByAddress = useCallback(
    (address: string) => entries.find(e => e.address === address),
    [entries],
  );

  return { entries, add, remove, rename, findByAddress };
}
