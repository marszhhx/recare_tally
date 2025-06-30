import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  Grid,
  AppBar,
  Toolbar,
  Divider,
  Snackbar,
  Alert,
  IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';
import HistoryIcon from '@mui/icons-material/History';
import DownloadIcon from '@mui/icons-material/Download';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { db } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Import the local SVG file
import ArcteryxLogo from './Arcteryx.svg';

// Default tally types
const DEFAULT_TALLY_TYPES = [
  'PRODUCT SERVICE REQUESTS',
  'IN-STORE REPAIRS',
  'DROP-OFFS',
  'AFTER-SALES CALLS',
  'DEFERRALS',
];

// Helper function to get Vancouver time
const getVancouverTime = () => {
  const now = new Date();

  // 使用更简单的方法：直接计算温哥华时间
  // 温哥华是UTC-8 (PST) 或 UTC-7 (PDT)
  // 我们需要动态检测是PST还是PDT

  // 获取温哥华时区的当前时间字符串
  const vancouverTimeString = now.toLocaleString('en-US', {
    timeZone: 'America/Vancouver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // 解析时间字符串
  const [datePart, timePart] = vancouverTimeString.split(', ');
  const [month, day, year] = datePart.split('/');
  const [hour, minute, second] = timePart.split(':');

  // 创建温哥华时间对象
  const vancouverTime = new Date(year, month - 1, day, hour, minute, second);

  return vancouverTime;
};

// Helper function to format date in Vancouver timezone
const formatDate = (date, options) => {
  if (!date) return 'Never';
  return new Date(date).toLocaleString('en-US', {
    timeZone: 'America/Vancouver',
    ...options,
  });
};

function App() {
  const [tallies, setTallies] = useState(() => {
    return DEFAULT_TALLY_TYPES.reduce(
      (acc, type) => ({ ...acc, [type]: { count: 0 } }),
      {}
    );
  });
  const [customTallyTypes, setCustomTallyTypes] = useState([]);
  const [openClearDialog, setOpenClearDialog] = useState(false);
  const [clearConfirmation, setClearConfirmation] = useState('');
  const [openAddTallyDialog, setOpenAddTallyDialog] = useState(false);
  const [newTallyName, setNewTallyName] = useState('');
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success',
  });
  const [historicalData, setHistoricalData] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [tallyOrder, setTallyOrder] = useState([]);

  // Get all tally types (default + custom)
  const getAllTallyTypes = () => [...DEFAULT_TALLY_TYPES, ...customTallyTypes];

  // Get ordered tally types
  const getOrderedTallyTypes = () => {
    if (tallyOrder.length === 0) {
      return getAllTallyTypes();
    }
    return tallyOrder.filter((type) => getAllTallyTypes().includes(type));
  };

  // Update tally order when custom tally types change
  useEffect(() => {
    const allTypes = getAllTallyTypes();
    if (tallyOrder.length === 0) {
      setTallyOrder(allTypes);
    } else {
      // Keep existing order but add any new types at the end
      const existingOrder = tallyOrder.filter((type) =>
        allTypes.includes(type)
      );
      const newTypes = allTypes.filter((type) => !existingOrder.includes(type));
      setTallyOrder([...existingOrder, ...newTypes]);
    }
  }, [customTallyTypes]);

  // Save global tally order
  const saveGlobalTallyOrder = async (order) => {
    try {
      const globalDocRef = doc(db, 'globalSettings', 'tallyOrder');
      await setDoc(globalDocRef, {
        tallyOrder: order,
        updatedAt: getVancouverTime().toISOString(),
      });
    } catch (error) {
      console.error('Error saving global tally order:', error);
    }
  };

  // Fetch global tally order
  const fetchGlobalTallyOrder = async () => {
    try {
      const globalDocRef = doc(db, 'globalSettings', 'tallyOrder');
      const globalDocSnap = await getDoc(globalDocRef);

      if (globalDocSnap.exists()) {
        const data = globalDocSnap.data();
        return data.tallyOrder || [];
      }
      return [];
    } catch (error) {
      console.error('Error fetching global tally order:', error);
      return [];
    }
  };

  // Get today's date in YYYY-MM-DD format for document ID using Vancouver time
  const getTodayDocId = () => {
    const now = new Date();
    // 直接获取温哥华时区的日期字符串
    const vancouverDateString = now.toLocaleDateString('en-CA', {
      timeZone: 'America/Vancouver',
    });
    return vancouverDateString; // 格式: YYYY-MM-DD
  };

  // Initialize tallies for all types
  const initializeTallies = (types) => {
    return types.reduce((acc, type) => ({ ...acc, [type]: { count: 0 } }), {});
  };

  // Check if it's midnight in Vancouver
  const isMidnightInVancouver = () => {
    const vancouverTime = getVancouverTime();
    const hours = vancouverTime.getHours();
    const minutes = vancouverTime.getMinutes();

    // 检查是否在午夜前后1分钟内
    const isMidnight =
      (hours === 0 && minutes === 0) || (hours === 23 && minutes === 59);

    console.log('Vancouver time check:', {
      hours,
      minutes,
      isMidnight,
      fullTime: vancouverTime.toLocaleString('en-US', {
        timeZone: 'America/Vancouver',
      }),
    });

    return isMidnight;
  };

  // Fetch global custom tally types
  const fetchGlobalCustomTallyTypes = async () => {
    try {
      const globalDocRef = doc(db, 'globalSettings', 'customTallyTypes');
      const globalDocSnap = await getDoc(globalDocRef);

      if (globalDocSnap.exists()) {
        const data = globalDocSnap.data();
        return data.customTallyTypes || [];
      }
      return [];
    } catch (error) {
      console.error('Error fetching global custom tally types:', error);
      return [];
    }
  };

  // Save global custom tally types
  const saveGlobalCustomTallyTypes = async (types) => {
    try {
      const globalDocRef = doc(db, 'globalSettings', 'customTallyTypes');
      await setDoc(globalDocRef, {
        customTallyTypes: types,
        updatedAt: getVancouverTime().toISOString(),
      });
    } catch (error) {
      console.error('Error saving global custom tally types:', error);
    }
  };

  // Reset tallies at midnight
  const resetTalliesAtMidnight = async () => {
    console.log('Resetting tallies at midnight...');
    const vancouverTime = getVancouverTime();
    const todayDocId = vancouverTime.toISOString().split('T')[0];
    const newDocRef = doc(db, 'tallies', todayDocId);

    // Fetch global custom tally types to preserve them
    const globalCustomTypes = await fetchGlobalCustomTallyTypes();
    const allTypes = [...DEFAULT_TALLY_TYPES, ...globalCustomTypes];
    const resetTallies = initializeTallies(allTypes);

    await setDoc(newDocRef, {
      tallies: resetTallies,
      timezone: 'America/Vancouver',
      customTallyTypes: globalCustomTypes,
      date: todayDocId,
      createdAt: vancouverTime.toISOString(),
    });

    setTallies(resetTallies);
    setCustomTallyTypes(globalCustomTypes);

    // Preserve the current tally order
    const currentOrder = getOrderedTallyTypes();
    setTallyOrder(currentOrder);

    setSnackbar({
      open: true,
      message: 'Tallies have been automatically reset for the new day.',
      severity: 'info',
    });
  };

  // Set up interval to check for midnight
  useEffect(() => {
    const checkMidnight = () => {
      if (isMidnightInVancouver()) {
        resetTalliesAtMidnight();
      }
    };

    // 每分钟检查一次
    const interval = setInterval(checkMidnight, 60000);

    // 立即检查一次当前时间
    checkMidnight();

    return () => clearInterval(interval);
  }, [customTallyTypes]);

  // Fetch historical data with timezone consideration
  const fetchHistoricalData = async () => {
    try {
      // 获取所有文档，不使用orderBy，避免createdAt字段问题
      const querySnapshot = await getDocs(collection(db, 'tallies'));
      const data = querySnapshot.docs.map((doc) => {
        const docData = doc.data();
        // 将文档ID转换为温哥华时间
        const vancouverDate = new Date(doc.id + 'T00:00:00');
        const formattedDate = vancouverDate.toLocaleString('en-US', {
          timeZone: 'America/Vancouver',
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

        return {
          id: doc.id,
          ...docData,
          displayTime: formatDate(docData.createdAt, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          }),
          formattedDate: formattedDate,
        };
      });

      // 按文档ID（日期）降序排序，确保最新的日期在前面
      const sortedData = data.sort((a, b) => {
        return b.id.localeCompare(a.id); // 降序排序
      });

      setHistoricalData(sortedData);
    } catch (error) {
      console.error('Error fetching historical data:', error);
      setSnackbar({
        open: true,
        message: 'Error loading historical data',
        severity: 'error',
      });
    }
  };

  // Fetch data from Firestore on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const todayDocId = getTodayDocId();
        const docRef = doc(db, 'tallies', todayDocId);
        const docSnap = await getDoc(docRef);

        // Fetch global custom tally types
        const globalCustomTypes = await fetchGlobalCustomTallyTypes();

        // Fetch global tally order
        const globalTallyOrder = await fetchGlobalTallyOrder();

        if (docSnap.exists()) {
          const data = docSnap.data();
          // Use global custom types if available, otherwise fall back to document's custom types
          const documentCustomTypes = data.customTallyTypes || [];
          const finalCustomTypes =
            globalCustomTypes.length > 0
              ? globalCustomTypes
              : documentCustomTypes;

          const allTypes = [...DEFAULT_TALLY_TYPES, ...finalCustomTypes];
          const initializedTallies = initializeTallies(allTypes);
          setTallies({ ...initializedTallies, ...(data.tallies || {}) });
          setCustomTallyTypes(finalCustomTypes);

          // Set tally order
          if (globalTallyOrder.length > 0) {
            setTallyOrder(globalTallyOrder);
          } else {
            setTallyOrder(allTypes);
          }
        } else {
          const allTypes = [...DEFAULT_TALLY_TYPES, ...globalCustomTypes];
          const defaultTallies = initializeTallies(allTypes);
          await setDoc(docRef, {
            tallies: defaultTallies,
            timezone: 'America/Vancouver',
            customTallyTypes: globalCustomTypes,
            date: todayDocId,
            createdAt: getVancouverTime().toISOString(),
          });
          setTallies(defaultTallies);
          setCustomTallyTypes(globalCustomTypes);

          // Set tally order
          if (globalTallyOrder.length > 0) {
            setTallyOrder(globalTallyOrder);
          } else {
            setTallyOrder(allTypes);
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        setSnackbar({
          open: true,
          message: 'Error loading data from Firebase',
          severity: 'error',
        });
      }
    };

    fetchData();
  }, []);

  const handleIncrement = async (type) => {
    const newTallies = {
      ...tallies,
      [type]: {
        count: tallies[type].count + 1,
      },
    };
    setTallies(newTallies);
    await updateTalliesInFirebase(newTallies);
  };

  const handleDecrement = async (type) => {
    if (tallies[type].count > 0) {
      const newTallies = {
        ...tallies,
        [type]: {
          count: tallies[type].count - 1,
        },
      };
      setTallies(newTallies);
      await updateTalliesInFirebase(newTallies);
    }
  };

  const updateTalliesInFirebase = async (newTallies) => {
    try {
      const todayDocId = getTodayDocId();
      const docRef = doc(db, 'tallies', todayDocId);
      const vancouverTime = getVancouverTime();
      await setDoc(docRef, {
        tallies: newTallies,
        timezone: 'America/Vancouver',
        customTallyTypes: customTallyTypes,
        date: todayDocId,
        createdAt: vancouverTime.toISOString(),
      });
    } catch (error) {
      console.error('Error updating tallies:', error);
      setSnackbar({
        open: true,
        message: 'Error saving data to Firebase',
        severity: 'error',
      });
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const handleOpenClearDialog = () => {
    setOpenClearDialog(true);
    setClearConfirmation('');
  };

  const handleCloseClearDialog = () => {
    setOpenClearDialog(false);
    setClearConfirmation('');
  };

  const handleOpenAddTallyDialog = () => {
    setOpenAddTallyDialog(true);
    setNewTallyName('');
  };

  const handleCloseAddTallyDialog = () => {
    setOpenAddTallyDialog(false);
    setNewTallyName('');
  };

  const handleAddTally = async () => {
    if (newTallyName.trim()) {
      const trimmedName = newTallyName.trim().toUpperCase();
      if (getAllTallyTypes().includes(trimmedName)) {
        setSnackbar({
          open: true,
          message: 'This tally type already exists.',
          severity: 'error',
        });
        return;
      }

      const newCustomTallyTypes = [...customTallyTypes, trimmedName];
      setCustomTallyTypes(newCustomTallyTypes);

      const newTallies = {
        ...tallies,
        [trimmedName]: { count: 0 },
      };
      setTallies(newTallies);

      try {
        // Save to global settings first
        await saveGlobalCustomTallyTypes(newCustomTallyTypes);

        // Then save to current day's document
        const todayDocId = getTodayDocId();
        const docRef = doc(db, 'tallies', todayDocId);
        const vancouverTime = getVancouverTime();
        await setDoc(docRef, {
          tallies: newTallies,
          timezone: 'America/Vancouver',
          customTallyTypes: newCustomTallyTypes,
          date: todayDocId,
          createdAt: vancouverTime.toISOString(),
        });

        handleCloseAddTallyDialog();
        setSnackbar({
          open: true,
          message: 'New tally type added successfully.',
          severity: 'success',
        });
      } catch (error) {
        console.error('Error adding new tally:', error);
        setSnackbar({
          open: true,
          message: 'Error saving new tally to Firebase',
          severity: 'error',
        });
      }
    }
  };

  const handleRemoveTally = async (type) => {
    if (DEFAULT_TALLY_TYPES.includes(type)) {
      setSnackbar({
        open: true,
        message: 'Cannot remove default tally types.',
        severity: 'error',
      });
      return;
    }

    const newCustomTallyTypes = customTallyTypes.filter((t) => t !== type);
    setCustomTallyTypes(newCustomTallyTypes);

    const newTallies = { ...tallies };
    delete newTallies[type];
    setTallies(newTallies);

    try {
      // Save to global settings first
      await saveGlobalCustomTallyTypes(newCustomTallyTypes);

      // Then save to current day's document
      const todayDocId = getTodayDocId();
      const docRef = doc(db, 'tallies', todayDocId);
      const vancouverTime = getVancouverTime();
      await setDoc(docRef, {
        tallies: newTallies,
        timezone: 'America/Vancouver',
        customTallyTypes: newCustomTallyTypes,
        date: todayDocId,
        createdAt: vancouverTime.toISOString(),
      });

      setSnackbar({
        open: true,
        message: 'Tally type removed successfully.',
        severity: 'success',
      });
    } catch (error) {
      console.error('Error removing tally:', error);
      setSnackbar({
        open: true,
        message: 'Error removing tally from Firebase',
        severity: 'error',
      });
    }
  };

  const handleClearAllTallies = async () => {
    if (clearConfirmation.toLowerCase() === 'confrim') {
      const vancouverTime = getVancouverTime();
      const resetTallies = initializeTallies(getAllTallyTypes());

      try {
        const todayDocId = getTodayDocId();
        const docRef = doc(db, 'tallies', todayDocId);
        await setDoc(docRef, {
          tallies: resetTallies,
          timezone: 'America/Vancouver',
          customTallyTypes: customTallyTypes,
          date: todayDocId,
          createdAt: vancouverTime.toISOString(),
        });

        setTallies(resetTallies);
        handleCloseClearDialog();
        setSnackbar({
          open: true,
          message: 'All tallies have been cleared successfully.',
          severity: 'success',
        });
      } catch (error) {
        console.error('Error clearing tallies:', error);
        setSnackbar({
          open: true,
          message: 'Error clearing tallies in Firebase',
          severity: 'error',
        });
      }
    } else {
      setSnackbar({
        open: true,
        message: 'Please type "confrim" to clear all tallies.',
        severity: 'error',
      });
    }
  };

  // Export historical data to Excel
  const exportToExcel = () => {
    // 按日期从旧到新排序
    const sortedData = [...historicalData].sort((a, b) => {
      const dateA = new Date(a.id + 'T00:00:00');
      const dateB = new Date(b.id + 'T00:00:00');
      return dateA - dateB; // 升序排序
    });

    const excelData = sortedData.map((day) => {
      // 将日期分成星期几和日期两部分
      const vancouverDate = new Date(day.id + 'T00:00:00');
      const weekday = vancouverDate.toLocaleString('en-US', {
        timeZone: 'America/Vancouver',
        weekday: 'long',
      });
      const date = vancouverDate.toLocaleString('en-US', {
        timeZone: 'America/Vancouver',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const row = {
        'Day of Week': weekday,
        Date: date,
      };

      getAllTallyTypes().forEach((type) => {
        row[type] = day.tallies[type]?.count || 0;
      });

      return row;
    });

    const ws = XLSX.utils.json_to_sheet(excelData);

    const wscols = [
      { wch: 15 }, // Day of Week
      { wch: 20 }, // Date
      ...getAllTallyTypes().map(() => ({ wch: 20 })), // Tally columns
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historical Data');

    const fileName = `ReCARE_Tally_History_${formatDate(getVancouverTime(), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })}.xlsx`;

    XLSX.writeFile(wb, fileName);
  };

  // Sortable Tally Component
  const SortableTally = ({ type }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: type });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <Grid item xs={12} key={type} ref={setNodeRef} style={style}>
        <Paper
          elevation={0}
          sx={{
            p: 3,
            border: '1px solid #e0e0e0',
            transition: 'all 0.2s ease',
            '&:hover': {
              borderColor: '#000000',
            },
          }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton
                {...attributes}
                {...listeners}
                sx={{
                  cursor: 'grab',
                  color: '#666',
                  '&:hover': {
                    color: '#000',
                  },
                }}>
                <DragIndicatorIcon />
              </IconButton>
              <Typography variant='h6' sx={{ fontWeight: 500 }}>
                {type}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {!DEFAULT_TALLY_TYPES.includes(type) && (
                <IconButton
                  onClick={() => handleRemoveTally(type)}
                  sx={{
                    color: '#d32f2f',
                    '&:hover': {
                      backgroundColor: 'rgba(211, 47, 47, 0.04)',
                    },
                  }}>
                  <RemoveCircleOutlineIcon />
                </IconButton>
              )}
              <Button
                variant='outlined'
                color='primary'
                onClick={() => handleDecrement(type)}
                startIcon={<RemoveIcon />}
                sx={{
                  minWidth: '40px',
                  width: '40px',
                  height: '40px',
                  padding: 0,
                  borderColor: '#000000',
                  color: '#000000',
                  '&:hover': {
                    borderColor: '#000000',
                    backgroundColor: 'rgba(0,0,0,0.04)',
                  },
                  '& .MuiButton-startIcon': {
                    margin: 0,
                  },
                }}></Button>
              <Typography
                variant='h5'
                sx={{ minWidth: '40px', textAlign: 'center' }}>
                {tallies[type]?.count || 0}
              </Typography>
              <Button
                variant='contained'
                color='primary'
                onClick={() => handleIncrement(type)}
                startIcon={<AddIcon />}
                sx={{
                  minWidth: '40px',
                  width: '40px',
                  height: '40px',
                  padding: 0,
                  backgroundColor: '#000000',
                  '&:hover': {
                    backgroundColor: '#333333',
                  },
                  '& .MuiButton-startIcon': {
                    margin: 0,
                  },
                }}></Button>
            </Box>
          </Box>
        </Paper>
      </Grid>
    );
  };

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = tallyOrder.indexOf(active.id);
      const newIndex = tallyOrder.indexOf(over.id);

      const newOrder = arrayMove(tallyOrder, oldIndex, newIndex);
      setTallyOrder(newOrder);

      // Save the new order globally
      saveGlobalTallyOrder(newOrder);
    }
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position='static' color='default' elevation={0} sx={{ py: 1 }}>
        <Toolbar sx={{ minHeight: '80px' }}>
          <Box
            sx={{
              flexGrow: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 3,
            }}>
            <img
              src={ArcteryxLogo}
              alt="ARC'TERYX Logo"
              style={{ height: '40px' }}
            />
            <Typography
              variant='h4'
              component='h1'
              sx={{
                fontWeight: 400,
                letterSpacing: '0.02em',
                color: '#000000',
              }}>
              ReCARE Tally
            </Typography>
          </Box>
          <Typography
            variant='body2'
            sx={{
              color: 'rgba(0, 0, 0, 0.5)',
              fontStyle: 'italic',
              letterSpacing: '0.05em',
              position: 'absolute',
              right: 16,
            }}>
            Developed by MARS ZHANG
          </Typography>
        </Toolbar>
      </AppBar>
      <Divider />

      <Container maxWidth='md'>
        <Box sx={{ my: 4 }}>
          <Box sx={{ mb: 3, textAlign: 'center' }}>
            <Typography variant='h6' sx={{ fontWeight: 500, color: '#000000' }}>
              {formatDate(getVancouverTime(), {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Typography>
          </Box>

          <Grid container spacing={3}>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}>
              <SortableContext
                items={getOrderedTallyTypes()}
                strategy={verticalListSortingStrategy}>
                {getOrderedTallyTypes().map((type) => (
                  <SortableTally key={type} type={type} />
                ))}
              </SortableContext>
            </DndContext>
          </Grid>

          <Box
            sx={{
              mt: 4,
              display: 'flex',
              justifyContent: 'center',
              gap: 2,
              flexDirection: 'column',
              alignItems: 'center',
            }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Button
                variant='outlined'
                color='primary'
                onClick={handleOpenAddTallyDialog}
                startIcon={<AddCircleOutlineIcon />}
                sx={{
                  borderColor: '#000000',
                  color: '#000000',
                  '&:hover': {
                    borderColor: '#000000',
                    backgroundColor: 'rgba(0,0,0,0.04)',
                  },
                }}>
                Add Custom Tally
              </Button>
              <Button
                variant='outlined'
                color='error'
                onClick={handleOpenClearDialog}
                startIcon={<DeleteIcon />}
                sx={{
                  borderColor: '#d32f2f',
                  color: '#d32f2f',
                  '&:hover': {
                    borderColor: '#b71c1c',
                    backgroundColor: 'rgba(211, 47, 47, 0.04)',
                  },
                }}>
                Clear All Tallies
              </Button>
              <Button
                variant='outlined'
                color='primary'
                onClick={() => {
                  setShowHistory(!showHistory);
                  if (!showHistory) {
                    fetchHistoricalData();
                  }
                }}
                startIcon={<HistoryIcon />}
                sx={{
                  borderColor: '#000000',
                  color: '#000000',
                  '&:hover': {
                    borderColor: '#000000',
                    backgroundColor: 'rgba(0,0,0,0.04)',
                  },
                }}>
                {showHistory ? 'Hide History' : 'View History'}
              </Button>
            </Box>
          </Box>

          {showHistory && (
            <Box sx={{ mt: 4 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 2,
                }}>
                <Typography variant='h6'>Historical Data</Typography>
                <Button
                  variant='outlined'
                  color='primary'
                  onClick={exportToExcel}
                  startIcon={<DownloadIcon />}
                  sx={{
                    borderColor: '#000000',
                    color: '#000000',
                    '&:hover': {
                      borderColor: '#000000',
                      backgroundColor: 'rgba(0,0,0,0.04)',
                    },
                  }}>
                  Export to Excel
                </Button>
              </Box>
              {[...historicalData]
                .sort((a, b) => {
                  const dateA = new Date(a.id + 'T00:00:00');
                  const dateB = new Date(b.id + 'T00:00:00');
                  return dateB - dateA; // 降序排序
                })
                .map((day) => (
                  <Paper
                    key={day.id}
                    elevation={0}
                    sx={{
                      p: 2,
                      mb: 2,
                      border: '1px solid #e0e0e0',
                    }}>
                    <Typography variant='subtitle1' sx={{ mb: 1 }}>
                      {day.formattedDate}
                    </Typography>
                    <Grid container spacing={2}>
                      {getAllTallyTypes().map((type) => (
                        <Grid item xs={12} sm={6} key={type}>
                          <Typography variant='body2'>
                            {type}: {day.tallies[type]?.count || 0}
                          </Typography>
                        </Grid>
                      ))}
                    </Grid>
                  </Paper>
                ))}
            </Box>
          )}

          <Dialog
            open={openClearDialog}
            onClose={handleCloseClearDialog}
            PaperProps={{
              sx: { borderRadius: 0 },
            }}>
            <DialogTitle
              sx={{
                borderBottom: '1px solid #e0e0e0',
                pb: 2,
                color: '#d32f2f',
              }}>
              Confirm Clear All Tallies
            </DialogTitle>
            <DialogContent sx={{ pt: 3 }}>
              <Typography variant='body1' sx={{ mb: 2 }}>
                This action will reset all tally counts to zero. This cannot be
                undone.
              </Typography>
              <Typography
                variant='body1'
                sx={{ fontWeight: 500, color: '#d32f2f', mb: 2 }}>
                To confirm, please type "confrim" in the field below:
              </Typography>
              <TextField
                autoFocus
                margin='dense'
                label='Confirmation'
                type='text'
                fullWidth
                value={clearConfirmation}
                onChange={(e) => setClearConfirmation(e.target.value)}
                placeholder='Type "confrim"'
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: '#e0e0e0',
                    },
                    '&:hover fieldset': {
                      borderColor: '#d32f2f',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#d32f2f',
                    },
                  },
                }}
              />
            </DialogContent>
            <DialogActions
              sx={{
                borderTop: '1px solid #e0e0e0',
                px: 3,
                py: 2,
              }}>
              <Button
                onClick={handleCloseClearDialog}
                sx={{
                  color: '#000000',
                  '&:hover': {
                    backgroundColor: 'rgba(0,0,0,0.04)',
                  },
                }}>
                Cancel
              </Button>
              <Button
                onClick={handleClearAllTallies}
                variant='contained'
                disabled={clearConfirmation.toLowerCase() !== 'confrim'}
                sx={{
                  backgroundColor: '#d32f2f',
                  '&:hover': {
                    backgroundColor: '#b71c1c',
                  },
                  '&.Mui-disabled': {
                    backgroundColor: 'rgba(211, 47, 47, 0.12)',
                  },
                }}>
                Clear All
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog
            open={openAddTallyDialog}
            onClose={handleCloseAddTallyDialog}
            PaperProps={{
              sx: { borderRadius: 0 },
            }}>
            <DialogTitle
              sx={{
                borderBottom: '1px solid #e0e0e0',
                pb: 2,
              }}>
              Add Custom Tally
            </DialogTitle>
            <DialogContent sx={{ pt: 3 }}>
              <Typography variant='body1' sx={{ mb: 2 }}>
                Enter the name for the new tally type:
              </Typography>
              <TextField
                autoFocus
                margin='dense'
                label='Tally Name'
                type='text'
                fullWidth
                value={newTallyName}
                onChange={(e) => setNewTallyName(e.target.value)}
                placeholder='Enter tally name'
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: '#e0e0e0',
                    },
                    '&:hover fieldset': {
                      borderColor: '#000000',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#000000',
                    },
                  },
                }}
              />
            </DialogContent>
            <DialogActions
              sx={{
                borderTop: '1px solid #e0e0e0',
                px: 3,
                py: 2,
              }}>
              <Button
                onClick={handleCloseAddTallyDialog}
                sx={{
                  color: '#000000',
                  '&:hover': {
                    backgroundColor: 'rgba(0,0,0,0.04)',
                  },
                }}>
                Cancel
              </Button>
              <Button
                onClick={handleAddTally}
                variant='contained'
                disabled={!newTallyName.trim().toUpperCase()}
                sx={{
                  backgroundColor: '#000000',
                  '&:hover': {
                    backgroundColor: '#333333',
                  },
                  '&.Mui-disabled': {
                    backgroundColor: 'rgba(0, 0, 0, 0.12)',
                  },
                }}>
                Add
              </Button>
            </DialogActions>
          </Dialog>

          <Snackbar
            open={snackbar.open}
            autoHideDuration={3000}
            onClose={handleCloseSnackbar}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
            <Alert
              onClose={handleCloseSnackbar}
              severity={snackbar.severity}
              sx={{ width: '100%' }}>
              {snackbar.message}
            </Alert>
          </Snackbar>
        </Box>
      </Container>
    </Box>
  );
}

export default App;
