import React from 'react';
import useAppStore from "../stores/AppStore";
import {Button, SelectBox, Switch} from "devextreme-react";

interface ToolbarProps {
  onRefreshRequest?: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({onRefreshRequest}) => {
  const pollingStatus = useAppStore(state => state.polling.status);
  const pollingInterval = useAppStore(state => state.polling.interval);
  const setPollingStatus = useAppStore(state => state.setPollingStatus);
  const setPollingInterval = useAppStore(state => state.setPollingInterval);
  const showNotification = useAppStore(state => state.showNotification);
  const invalidateCache = useAppStore(state => state.invalidateCache);

  const handlePollingToggle = (e: any) => {
    const newStatus = e.value ? 'started' : 'stopped';
    setPollingStatus(newStatus);
    showNotification(e.value ? 'Activated realtime update' : 'Inactivated realtime update');
  };

  const handleIntervalChange = (e: any) => {
    setPollingInterval(e.value);
    showNotification(`Changed update interval to ${e.value / 1000}sec.`);
  };

  const handleRefresh = () => {
    if (onRefreshRequest)
      onRefreshRequest();

    showNotification('Refreshed data');
  };

  const handleClearCache = async () => {
    try {
      await invalidateCache();

      if (onRefreshRequest)
        onRefreshRequest();

      showNotification('Invalidated cache & refreshed data');
    } catch (error) {}
  };

  const intervalItems = [
    { text: '1s', value: 1000 },
    { text: '5s', value: 5000 },
    { text: '10s', value: 10000 },
    { text: '30s', value: 30000 },
    { text: '1m', value: 60000 },
  ];

  return (
    <div className="flex items-center space-x-4 px-4 py-2 bg-white rounded-lg shadow-sm">
      <div className="flex items-center space-x-2">
        <span className="text-gray-700">Realtime update</span>
        <Switch value={pollingStatus === 'started'} switchedOnText="On" switchedOffText="Off"
                hint="Activate/Inactivate realtime update" onValueChanged={handlePollingToggle} />
      </div>

      <div className="flex items-center space-x-2">
        <span className="text-gray-700">Update interval:</span>
        <SelectBox items={intervalItems} displayExpr="text" valueExpr="value"
                   value={pollingInterval} width={150} onValueChanged={handleIntervalChange} />
      </div>

      <div className="ml-auto flex space-x-4">
        <Button text="Refresh" icon="refresh" onClick={handleRefresh} />
        <Button text="Clear cache" icon="clear" onClick={handleClearCache} />
      </div>
    </div>
  );
};

export default Toolbar;