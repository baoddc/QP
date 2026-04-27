/**
 * Google Apps Script Backend for Attendance App
 * 
 * Instructions:
 * 1. Create a Google Sheet.
 * 2. Rename 'Sheet1' to 'Attendance'.
 * 3. Create another sheet named 'Employees'.
 * 4. In 'Employees', add headers: ID, Name, Department, Position.
 * 5. In 'Attendance', add headers: ID, Name, Date, CheckIn, CheckOut, Status, Note, CheckIn_Lat, CheckIn_Lng, CheckOut_Lat, CheckOut_Lng.
 * 6. Go to Extensions > Apps Script and paste this code.
 * 7. Deploy as Web App (Execute as: Me, Who has access: Anyone).
 */

const SS = SpreadsheetApp.getActiveSpreadsheet();
const ATTENDANCE_SHEET = SS.getSheetByName('Attendance');
const EMPLOYEE_SHEET = SS.getSheetByName('Employees');
const SETTINGS_SHEET = SS.getSheetByName('Settings');

function doGet(e) {
  const action = e.parameter.action;
  
  if (action === 'getEmployees') {
    const data = EMPLOYEE_SHEET.getDataRange().getValues();
    const headers = data.shift();
    const result = data.map(row => {
      let obj = {};
      headers.forEach((h, i) => obj[h.toLowerCase()] = row[i]);
      return obj;
    });
    return contentResponse(result);
  }
  
  if (action === 'getAttendance') {
    const data = ATTENDANCE_SHEET.getDataRange().getValues();
    const headers = data.shift();
    const result = data.map(row => {
      let obj = {};
      headers.forEach((h, i) => {
        let val = row[i];
        if (val instanceof Date) {
          if (h.toLowerCase().includes('time') || h.toLowerCase().includes('check')) {
            val = Utilities.formatDate(val, SS.getSpreadsheetTimeZone(), "HH:mm:ss");
          } else {
            val = Utilities.formatDate(val, SS.getSpreadsheetTimeZone(), "dd/MM/yyyy");
          }
        }
        obj[h.toLowerCase()] = val;
      });
      return obj;
    });
    return contentResponse(result);
  }
  
  if (action === 'getStats') {
    const employees = EMPLOYEE_SHEET.getLastRow() - 1;
    const timezone = SS.getSpreadsheetTimeZone();
    const today = Utilities.formatDate(new Date(), timezone, "dd/MM/yyyy");
    const attendanceData = ATTENDANCE_SHEET.getDataRange().getValues();
    
    let presentIds = new Set();
    let lateIds = new Set();
    
    attendanceData.forEach((row, i) => {
      if (i === 0 || !row[2]) return;
      let date;
      if (row[2] instanceof Date) {
        date = Utilities.formatDate(row[2], timezone, "dd/MM/yyyy");
      } else {
        date = row[2].toString(); 
      }
      
      if (date === today) {
        presentIds.add(row[0]);
        if (row[5] === 'Late') lateIds.add(row[0]);
      }
    });
    
    return contentResponse({
      total: employees > 0 ? employees : 0,
      present: presentIds.size,
      late: lateIds.size,
      leave: 0 
    });
  }

  if (action === 'getSettings') {
    return contentResponse(getSettings());
  }
  
  if (action === 'checkin') {
    return checkIn(e.parameter.employeeId, e.parameter.employeeName, e.parameter.configStartTime, e.parameter.lat, e.parameter.lng);
  }
  
  if (action === 'checkout') {
    return checkOut(e.parameter.employeeId, e.parameter.lat, e.parameter.lng);
  }
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;
  
  if (action === 'checkin') {
    return checkIn(data.employeeId, data.employeeName, data.configStartTime, data.lat, data.lng);
  }
  
  if (action === 'checkout') {
    return checkOut(data.employeeId, data.lat, data.lng);
  }

  if (action === 'updateSettings') {
    return updateSettings(data.settings);
  }
}

function getSettings() {
  if (!SETTINGS_SHEET) return {};
  const data = SETTINGS_SHEET.getDataRange().getValues();
  let settings = {};
  data.forEach((row, i) => {
    if (i === 0) return; // Skip headers
    if (row[0]) settings[row[0]] = row[1];
  });
  return settings;
}

function updateSettings(settings) {
  if (!SETTINGS_SHEET) return contentResponse({ success: false, message: 'Sheet "Settings" không tồn tại!' });
  
  const data = SETTINGS_SHEET.getDataRange().getValues();
  const keys = data.map(row => row[0]);
  
  for (let key in settings) {
    const value = settings[key];
    const index = keys.indexOf(key);
    
    if (index !== -1) {
      SETTINGS_SHEET.getRange(index + 1, 2).setValue(value);
    } else {
      SETTINGS_SHEET.appendRow([key, value]);
      keys.push(key);
    }
  }
  
  return contentResponse({ success: true, message: 'Cài đặt đã được cập nhật!' });
}

function checkIn(id, name, configStartTime, lat, lng) {
  const now = new Date();
  const timezone = SS.getSpreadsheetTimeZone();
  const date = Utilities.formatDate(now, timezone, "dd/MM/yyyy");
  const time = Utilities.formatDate(now, timezone, "HH:mm:ss");
  
  const attendanceData = ATTENDANCE_SHEET.getDataRange().getValues();
  for (let i = attendanceData.length - 1; i >= 1; i--) {
    let rowDate;
    if (attendanceData[i][2] instanceof Date) {
      rowDate = Utilities.formatDate(attendanceData[i][2], timezone, "dd/MM/yyyy");
    } else {
      rowDate = attendanceData[i][2].toString();
    }

    if (attendanceData[i][0] == id && rowDate === date) {
      if (attendanceData[i][4] === '') {
        return contentResponse({ success: false, message: 'Bạn đang trong ca làm việc (chưa check-out)!' });
      }
    }
  }
  
  let status = 'On Time';
  if (configStartTime) {
    const [h, m] = configStartTime.split(':');
    const startLimit = new Date(now.getTime());
    startLimit.setHours(parseInt(h), parseInt(m), 0);
    if (now > startLimit) status = 'Late';
  }
  
  // Columns: A:ID, B:Name, C:Date, D:CheckIn, E:CheckOut, F:Status, G:Note, H:Lat, I:Lng
  ATTENDANCE_SHEET.appendRow([id, name, date, time, '', status, '', toDMS(lat, true), toDMS(lng, false)]);
  
  const lastRow = ATTENDANCE_SHEET.getLastRow();
  ATTENDANCE_SHEET.getRange(lastRow, 4).setNumberFormat('HH:mm:ss');
  
  return contentResponse({ success: true, message: 'Check-in thành công!' });
}

function checkOut(id, lat, lng) {
  const now = new Date();
  const timezone = SS.getSpreadsheetTimeZone();
  const date = Utilities.formatDate(now, timezone, "dd/MM/yyyy");
  const time = Utilities.formatDate(now, timezone, "HH:mm:ss");
  
  const attendanceData = ATTENDANCE_SHEET.getDataRange().getValues();
  for (let i = attendanceData.length - 1; i >= 1; i--) {
    let rowDate;
    if (attendanceData[i][2] instanceof Date) {
      rowDate = Utilities.formatDate(attendanceData[i][2], timezone, "dd/MM/yyyy");
    } else {
      rowDate = attendanceData[i][2].toString();
    }

    if (attendanceData[i][0] == id && rowDate === date) {
      if (attendanceData[i][4] === '') {
        const checkoutCell = ATTENDANCE_SHEET.getRange(i + 1, 5);
        checkoutCell.setValue(time);
        checkoutCell.setNumberFormat('HH:mm:ss');
        
        // Update Check-out Coordinates (Columns J:10 and K:11)
        if (lat) ATTENDANCE_SHEET.getRange(i + 1, 10).setValue(toDMS(lat, true));
        if (lng) ATTENDANCE_SHEET.getRange(i + 1, 11).setValue(toDMS(lng, false));
        
        return contentResponse({ success: true, message: 'Check-out thành công!' });
      }
    }
  }
  
  return contentResponse({ success: false, message: 'Không tìm thấy lượt Check-in phù hợp để Check-out!' });
}

function contentResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Converts Decimal Degrees to DMS format (Degrees, Minutes, Seconds)
 * Example: 10.8202 -> 10°49'12.7"N
 */
function toDMS(coord, isLat) {
  if (coord === null || coord === undefined || coord === '') return '';
  const val = parseFloat(coord);
  if (isNaN(val)) return coord;

  const absolute = Math.abs(val);
  const degrees = Math.floor(absolute);
  const minutesNotTruncated = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = ((minutesNotTruncated - minutes) * 60).toFixed(1);
  
  const direction = isLat 
    ? (val >= 0 ? 'N' : 'S') 
    : (val >= 0 ? 'E' : 'W');
    
  return degrees + '°' + minutes + "'" + seconds + '"' + direction;
}
