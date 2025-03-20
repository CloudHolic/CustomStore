import React, {useEffect, useState, useCallback} from 'react';
import Notification from './components/Notification';
import StatusBar from "./components/StatusBar";
import Toolbar from "./components/Toolbar";
import Grid from "./components/Grid";

const App: React.FC = () => {
  const [refreshGrid, setRefreshGrid] = useState<(() => void) | null>(null);

  const handleGridInitialized = useCallback((refresh: () => void) => {
      setRefreshGrid(refresh);
  }, []);

  const handleRefreshRequested = useCallback(() => {
      if (refreshGrid)
          refreshGrid();
  }, [refreshGrid]);

  useEffect(() => {
    const handleGridRefresh = () => {
        handleRefreshRequested();
    };

    document.addEventListener('grid-refresh', handleGridRefresh);

    return () => {
      document.removeEventListener('grid-refresh', handleGridRefresh);
    }
  }, [handleRefreshRequested]);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white shadow-sm px-6 py-4 border-b">
        <h1 className="text-2xl font-semibold text-gray-800">Custom Store Sample</h1>
      </header>

      <main className="flex-grow flex flex-col p-6">
        <Toolbar onRefreshRequest={handleRefreshRequested} />

        <div className="flex-grow mt-4">
          <Grid onInitialized={handleGridInitialized} />
        </div>
      </main>

      <StatusBar />

      <Notification />
    </div>
  );
};

export default App;