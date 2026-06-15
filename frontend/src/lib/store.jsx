import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import { currentMonth } from './format.js';

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [month, setMonth] = useState(currentMonth());
  const [people, setPeople] = useState([]);
  const [sources, setSources] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ready, setReady] = useState(false);

  const refreshPeople = useCallback(async () => { setPeople(await api.get('/people')); }, []);
  const refreshSources = useCallback(async () => { setSources(await api.get('/sources')); }, []);
  const refreshCategories = useCallback(async () => { setCategories(await api.get('/categories')); }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshPeople(), refreshSources(), refreshCategories()]);
  }, [refreshPeople, refreshSources, refreshCategories]);

  useEffect(() => { refreshAll().finally(() => setReady(true)); }, [refreshAll]);

  const value = {
    month, setMonth,
    people, refreshPeople,
    sources, refreshSources,
    categories, refreshCategories,
    refreshAll, ready
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore fora do StoreProvider');
  return ctx;
}
