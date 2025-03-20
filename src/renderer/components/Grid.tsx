import React, {useState, useCallback, useEffect, useRef} from "react";
import useAppStore from "../stores/AppStore";
import {clearInterval} from "node:timers";
import {CustomStore} from "devextreme/common/data";
import {DataGrid, LoadPanel} from "devextreme-react";
import {Column, FilterRow, Pager, Paging, Scrolling, SearchPanel} from "devextreme-react/cjs/data-grid";

interface DataGridProps {
  onInitialized?: (refresh: () => void) => void;
}

const Grid: React.FC<DataGridProps> = ({onInitialized}) => {
  const pollingStatus = useAppStore(state => state.polling.status);
  const pollingInterval = useAppStore(state => state.polling.interval);
  const setLastUpdateTime = useAppStore(state => state.setLastUpdateTime);
  const showNotification = useAppStore(state => state.showNotification);

  const [lastSearchTerm, setLastSearchTerm] = useState<string>('');

  const dataGridRef = useRef<any>(null);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dataStoreRef = useRef<any>(null);

  const refreshGrid = useCallback(() => {
    if (dataGridRef.current?.instance)
      dataGridRef.current.instance().refresh();
  }, []);

  useEffect(() => {
    if (onInitialized)
      onInitialized(refreshGrid);
  }, [onInitialized, refreshGrid]);

  const highlightSearchText = useCallback((text: string, searchValue: string): string => {
    if (!searchValue || !text)
      return text;

    const escapedSearchValue = searchValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('(' + escapedSearchValue + ')', 'gi');

    return text.toString().replace(regex, '<span class="search-highlight">$1</span>');
  }, []);

  const checkForNewData = useCallback(async () => {
    try {
      const status = await window.electronAPI.requestData({
        type: 'check-new-data'
      });

      if (status && status.hasNewData && status.lastCollection) {
        refreshGrid();

        const formattedTime = new Date(status.lastCollection.timestamp).toLocaleTimeString();
        setLastUpdateTime(formattedTime);

        showNotification(`Received new ${status.lastCollection.count} items`);

        await window.electronAPI.requestData({
          type: 'mark-data-delivered'
        });
      }
    } catch (error) {
      console.error('Data checking error: ', error);
    }
  }, [refreshGrid, setLastUpdateTime, showNotification]);

  const startPolling = useCallback(async () => {
    if (pollingTimerRef.current)
      clearInterval(pollingTimerRef.current);

    await checkForNewData();
    pollingTimerRef.current = setInterval(checkForNewData, pollingInterval);
  }, [checkForNewData, pollingInterval]);

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (pollingStatus === 'started')
      startPolling().then();
    else
      stopPolling();

    return () => {
      stopPolling();
    }
  }, [pollingStatus, startPolling, stopPolling]);

  if (!dataStoreRef.current) {
    dataStoreRef.current = new CustomStore({
      key: 'id',
      load: async function (loadOptions: any) {
        if (loadOptions.searchExpr)
          setLastSearchTerm(loadOptions.searchExpr);

        try {
          const result = await window.electronAPI.requestData({
            ...loadOptions,
            searchValue: loadOptions.searchExpr
          });

          if (result.searchTerm)
            setLastSearchTerm(loadOptions.searchExpr);

          return {
            data: result.data,
            totalCount: result.totalCount
          };
        } catch (error: any) {
          console.error("Error loading data: ", error);
          showNotification(`Error loading data: ${error.message}`, 5000);
          throw error;
        }
      }
    });
  }

  const renderCell = (data: any) => {
    const text = data.value || '';

    if (lastSearchTerm && text) {
      const highlightedText = highlightSearchText(text, lastSearchTerm);
      return <div dangerouslySetInnerHTML={{__html: highlightedText}}/>;
    }

    return <div>{text}</div>
  };

  return (
      <DataGrid ref={dataGridRef} dataSource={{store: dataStoreRef.current}} remoteOperations={true} showBorders={true}
                className="w-full h-full bg-white shadow-md rounded-md"
                onOptionChanged={(e) => {
                  if (e.name === 'searchPanel' && e.fullName ==='searchPanel.text')
                    setLastSearchTerm(e.value || '');
                }}>
        <LoadPanel visible={true}/>
        <SearchPanel visible={true} width={240} placeholder="Search..."/>
        <FilterRow visible={true}/>
        <Scrolling mode="virtual"/>
        <Paging defaultPageSize={10}/>
        <Pager showPageSizeSelector={true} allowedPageSizes={[5, 10, 20]} showInfo={true}/>

        <Column dataField="id" caption="ID" width={70} alignment="right"/>
        <Column dataField="description" caption="Description" cellRender={renderCell}/>
        <Column dataField="price" caption="Price" dataType="number" format={{type: 'fixedPoint', precision: 2}}
                alignment="right"/>
        <Column dataField="category" caption="Category"/>
        <Column dataField="created_at" caption="Create At" dataType="datetime"/>
      </DataGrid>
  );
};

export default Grid;
