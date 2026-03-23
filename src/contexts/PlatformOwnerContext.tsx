import { createContext, useContext, useState, ReactNode } from "react";

interface PlatformOwnerContextType {
  previewMode: boolean;
  setPreviewMode: (v: boolean) => void;
}

const PlatformOwnerContext = createContext<PlatformOwnerContextType>({
  previewMode: false,
  setPreviewMode: () => {},
});

export function PlatformOwnerProvider({ children }: { children: ReactNode }) {
  const [previewMode, setPreviewMode] = useState(false);
  return (
    <PlatformOwnerContext.Provider value={{ previewMode, setPreviewMode }}>
      {children}
    </PlatformOwnerContext.Provider>
  );
}

export function usePlatformOwner() {
  return useContext(PlatformOwnerContext);
}
