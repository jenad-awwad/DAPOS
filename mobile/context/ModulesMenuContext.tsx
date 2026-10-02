import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ModulesMenuContextValue = {
  visible: boolean;
  open: () => void;
  close: () => void;
};

const ModulesMenuContext = createContext<ModulesMenuContextValue | null>(null);

export function ModulesMenuProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);

  const value = useMemo(
    () => ({ visible, open, close }),
    [visible, open, close],
  );

  return (
    <ModulesMenuContext.Provider value={value}>
      {children}
    </ModulesMenuContext.Provider>
  );
}

export function useModulesMenu() {
  const ctx = useContext(ModulesMenuContext);
  if (!ctx) {
    throw new Error("useModulesMenu must be used within ModulesMenuProvider");
  }
  return ctx;
}
