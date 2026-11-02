/**
 * PORTAL-DOOR - Google Apps Script Backend (v7.0)
 * Central Cloud Database & Photo Storage for Portal Door & Social Medium App
 * 
 * Capabilities:
 * 1. Uploads Photobooth photos to Google Drive "Portal Photos" folder and returns direct image links.
 * 2. Automatically records every captured photo into the "Photobooth_Photos" tab in Google Sheets:
 *    [Timestamp, Card_ID, Title, Type, Image_URL, File_ID]
 * 3. Deletes media rows from Google Sheet ("Photobooth_Photos", "Developer", "Users", or "Photobooth" tabs) when "-" is pressed on kiosk.
 * 4. Provides permanent, 24/7 read access to all member photos even when the kiosk is off and Render is asleep.
 * 
 * SPREADSHEET ID: 1vwXuw-TBYxUXKXUSipa2drArRNXZuKNwbXFhxcVbIc0
 * 
 * DEPLOYMENT INSTRUCTIONS:
 * 1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1vwXuw-TBYxUXKXUSipa2drArRNXZuKNwbXFhxcVbIc0/edit
 * 2. Go to Extensions > Apps Script.
 * 3. Replace all code in Code.gs with this file.
 * 4. In the top toolbar dropdown (next to "Debug"), select "testAuthorization".
 * 5. Click "Run" ▶️.
 * 6. Google will show "Authorization Required". Click "Review Permissions" > choose your account > "Advanced" > "Go to Untitled project (unsafe)" > "Allow".
 * 7. Click Deploy > Manage deployments > click pencil icon > Version: "New version" > Deploy!
 */

var SPREADSHEET_ID = '1vwXuw-TBYxUXKXUSipa2drArRNXZuKNwbXFhxcVbIc0';

// Helper to safely get the spreadsheet instance
function getSpreadsheet() {
  try {
    return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (_) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
}

// Helper to find the actual last row with content (ignoring empty trailing grid rows)
function getLastContentRow(sheet) {
  var values = sheet.getDataRange().getValues();
  for (var r = values.length - 1; r >= 0; r--) {
    for (var c = 0; c < values[r].length; c++) {
      var val = values[r][c];
      if (val !== '' && val !== null && val !== undefined) {
        return r + 1;
      }
    }
  }
  return 1;
}

// Helper to get or automatically create the "Photobooth_Photos" sheet tab
function getPhotoboothSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Photobooth_Photos');
  if (!sheet) {
    sheet = ss.insertSheet('Photobooth_Photos');
    sheet.appendRow(['Timestamp', 'Card_ID', 'Title', 'Type', 'Image_URL', 'File_ID']);
    // Format header row bold
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  }
  return sheet;
}

// Helper to get or automatically create the "Game_Room_Media" sheet tab
function getGameRoomSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Game_Room_Media');
  if (!sheet) {
    sheet = ss.insertSheet('Game_Room_Media');
    sheet.appendRow(['Timestamp', 'Card_ID', 'Title', 'Type', 'Target_Screen', 'Media_URL', 'File_ID', 'Uploader_Name', 'Visibility']);
    // Format header row bold
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
  } else {
    // Ensure 9th header column (Visibility) exists
    var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    if (headers.length < 9 || !String(headers[8] || '').toLowerCase().includes('visibility')) {
      sheet.getRange(1, 9).setValue('Visibility').setFontWeight('bold');
    }
  }
  return sheet;
}

// Helper to get or automatically create the "Game Room Media" Google Drive folder
function getGameRoomFolder() {
  var folders = DriveApp.getFoldersByName('Game Room Media');
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder('Game Room Media');
}

// Helper to rename spreadsheet to "SM App Database"
function renameSpreadsheetToSMAppDatabase() {
  var ss = getSpreadsheet();
  try {
    ss.rename('SM App Database');
  } catch (err) {
    Logger.log("Could not rename spreadsheet: " + err);
  }
  return ss.getName();
}

// Helper: Read media records from the Game_Room_Media sheet tab
function readGameRoomMediaFromSheet(targetCardId, includeAll) {
  var items = [];
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName('Game_Room_Media');
    if (!sheet) return items;

    var values = sheet.getDataRange().getDisplayValues();
    if (!values || values.length <= 1) return items;

    var header = values[0];
    var timeIdx = 0, cardIdx = 1, titleIdx = 2, typeIdx = 3, screenIdx = 4, urlIdx = 5, fileIdx = 6, uploaderIdx = 7, visIdx = 8;

    for (var i = 0; i < header.length; i++) {
      var h = String(header[i]).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (h.includes('time') || h.includes('date')) timeIdx = i;
      else if (h.includes('card') || h === 'id' || h.includes('user')) cardIdx = i;
      else if (h.includes('uploader') || h.includes('author') || h.includes('member')) uploaderIdx = i;
      else if (h.includes('title') || h === 'name') titleIdx = i;
      else if (h.includes('type')) typeIdx = i;
      else if (h.includes('screen') || h.includes('target')) screenIdx = i;
      else if (h.includes('url') || h.includes('link') || h.includes('media') || h.includes('image')) urlIdx = i;
      else if (h.includes('file')) fileIdx = i;
      else if (h.includes('visibility') || h.includes('scope') || h.includes('private')) visIdx = i;
    }

    var cleanTarget = targetCardId ? String(targetCardId).trim() : '';

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var url = String(row[urlIdx] || '').trim();
      if (!url) continue;

      var fileId = String(row[fileIdx] || '').trim();
      var cardId = String(row[cardIdx] || '').trim();
      var timestamp = row[timeIdx] ? new Date(row[timeIdx]).toISOString() : new Date().toISOString();
      var visibility = String(row[visIdx] || 'public').toLowerCase().trim();
      if (!visibility || visibility !== 'private') visibility = 'public';

      // Check card match
      var isOwner = false;
      if (cleanTarget) {
        var cardTokens = cardId.split(/[,;\s]+/).map(function(t){ return t.trim(); });
        if (cardTokens.indexOf(cleanTarget) !== -1 || cardId === cleanTarget) {
          isOwner = true;
        }
      }

      // If private and not developer/all, only the owner can see it
      if (visibility === 'private' && !isOwner && !includeAll) {
        continue;
      }

      items.push({
        id: fileId || ('gameroom_' + r),
        fileId: fileId,
        cardId: cardId,
        title: String(row[titleIdx] || 'Custom Battlemap').trim(),
        type: String(row[typeIdx] || 'map').trim(),
        targetScreen: String(row[screenIdx] || 'table').trim(),
        url: url,
        downloadUrl: fileId ? ("https://drive.google.com/uc?export=download&id=" + fileId) : url,
        uploaderName: String(row[uploaderIdx] || '').trim(),
        visibility: visibility,
        timestamp: timestamp
      });
    }

    // Sort newest first
    items.sort(function(a, b) {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
  } catch (err) {
    Logger.log("Error reading gameroom media from sheet: " + err);
  }
  return items;
}

// One-time authorization trigger function - select this in Apps Script and click Run
function testAuthorization() {
  var ss = getSpreadsheet();
  try {
    ss.rename('SM App Database');
  } catch (_) {}
  var sheet = getPhotoboothSheet(ss);
  var gameSheet = getGameRoomSheet(ss);
  DriveApp.getRootFolder();
  getGameRoomFolder();
  Logger.log("Authorization Successful! Connected to Sheet: " + ss.getName() + " | Tabs: " + sheet.getName() + ", " + gameSheet.getName());
}

// Function to automatically import all photos from a Google Drive folder into the "Photobooth_Photos" sheet tab
function importPhotosFromAlbum(folderId, targetCardId) {
  if (!folderId) folderId = '16piBJbrJu3wpUfR3JD2_tjQHI_Uw_z0D'; // Album provided by user
  
  var folder;
  try {
    folder = DriveApp.getFolderById(folderId);
  } catch (err) {
    Logger.log("Could not find folder with ID: " + folderId + " Error: " + err);
    return { status: 'error', message: err.toString() };
  }

  var ss = getSpreadsheet();
  var photoSheet = getPhotoboothSheet(ss);
  var values = photoSheet.getDataRange().getValues();
  var existingIds = {};
  var fileCol = 5;
  var urlCol = 4;

  for (var r = 1; r < values.length; r++) {
    var fId = String(values[r][fileCol] || '').trim();
    if (fId) existingIds[fId] = true;
    var u = String(values[r][urlCol] || '').trim();
    if (u) existingIds[u] = true;
  }

  var files = folder.getFiles();
  var importedCount = 0;
  var skippedCount = 0;
  var importedList = [];

  while (files.hasNext()) {
    var file = files.next();
    var mime = file.getMimeType();
    var name = file.getName();
    
    // Only import image files
    if (!mime.startsWith('image/') && !name.match(/\.(jpe?g|png|webp|gif|bmp)$/i)) {
      continue;
    }

    var fid = file.getId();
    var directUrl = "https://lh3.googleusercontent.com/d/" + fid;
    if (existingIds[fid] || existingIds[directUrl]) {
      skippedCount++;
      continue;
    }

    // Ensure image is viewable with link
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (_) {}

    var timestamp = file.getDateCreated().toISOString();
    var fileDesc = file.getDescription() || '';

    // Determine card ID: targetCardId > file description > filename match > blank
    var cardId = targetCardId ? String(targetCardId).trim() : (fileDesc ? String(fileDesc).trim() : '');
    if (!cardId) {
      var fnMatch = name.match(/Portal_Photo_([0-9a-zA-Z]+)_/);
      if (fnMatch && fnMatch[1]) cardId = fnMatch[1];
    }

    photoSheet.appendRow([
      timestamp,
      cardId,
      cardId ? ('Portal Photo #' + cardId) : 'Portal Photo',
      'image',
      directUrl,
      fid
    ]);

    existingIds[fid] = true;
    importedCount++;
    importedList.push({ fileId: fid, name: name, cardId: cardId });
  }

  Logger.log("Import Complete! Imported " + importedCount + " new photos. Skipped " + skippedCount + " duplicates.");
  return {
    status: 'success',
    folderName: folder.getName(),
    folderId: folderId,
    imported: importedCount,
    skipped: skippedCount,
    photos: importedList
  };
}

// Helper: Read photos from the Photobooth_Photos sheet tab
function readPhotosFromSheet() {
  var photos = [];
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName('Photobooth_Photos');
    if (!sheet) return photos;

    var values = sheet.getDataRange().getValues();
    if (!values || values.length <= 1) return photos;

    // Header index mapping
    var header = values[0];
    var timeIdx = 0, cardIdx = 1, titleIdx = 2, typeIdx = 3, urlIdx = 4, fileIdx = 5;
    for (var i = 0; i < header.length; i++) {
      var h = String(header[i]).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (h.includes('time') || h.includes('date')) timeIdx = i;
      else if (h.includes('card') || h === 'id') cardIdx = i;
      else if (h.includes('title') || h.includes('name')) titleIdx = i;
      else if (h.includes('url') || h.includes('link') || h.includes('image')) urlIdx = i;
      else if (h.includes('file')) fileIdx = i;
    }

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var url = String(row[urlIdx] || '').trim();
      if (!url) continue;

      var fileId = String(row[fileIdx] || '').trim();
      var cardId = String(row[cardIdx] || '').trim();
      var timestamp = row[timeIdx] ? new Date(row[timeIdx]).toISOString() : new Date().toISOString();

      photos.push({
        id: fileId || ('photo_' + r),
        fileId: fileId,
        name: String(row[titleIdx] || 'Portal Photo').trim(),
        cardId: cardId,
        url: url,
        downloadUrl: fileId ? ("https://drive.google.com/uc?export=download&id=" + fileId) : url,
        timestamp: timestamp
      });
    }

    // Sort newest first
    photos.sort(function(a, b) {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
  } catch (err) {
    Logger.log("Error reading photos from sheet: " + err);
  }
  return photos;
}

// Helper: Read photos from the "Portal Photos" Google Drive folder (fallback)
function readPhotosFromDrive() {
  var photos = [];
  try {
    var folders = DriveApp.getFoldersByName('Portal Photos');
    if (!folders.hasNext()) return photos;
    var folder = folders.next();
    var files = folder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      photos.push({
        id: f.getId(),
        fileId: f.getId(),
        name: f.getName(),
        cardId: f.getDescription() || '',
        url: "https://lh3.googleusercontent.com/d/" + f.getId(),
        downloadUrl: "https://drive.google.com/uc?export=download&id=" + f.getId(),
        timestamp: f.getDateCreated().toISOString()
      });
    }
    photos.sort(function(a, b) {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
  } catch (err) {
    Logger.log("Error reading photos from drive: " + err);
  }
  return photos;
}

// GET handler: Returns all photos as JSON (prefers Sheet, falls back to Drive), or triggers import
function doGet(e) {
  try {
    // Check if import action was requested via GET URL
    if (e && e.parameter && (e.parameter.action === 'import' || e.parameter.action === 'import_folder')) {
      var targetFolder = e.parameter.folderId || '16piBJbrJu3wpUfR3JD2_tjQHI_Uw_z0D';
      var targetCard = e.parameter.cardId || '';
      var importResult = importPhotosFromAlbum(targetFolder, targetCard);
      return ContentService.createTextOutput(JSON.stringify(importResult)).setMimeType(ContentService.MimeType.JSON);
    }

    // Check if cleanup action was requested to trim empty grid rows
    if (e && e.parameter && e.parameter.action === 'cleanup') {
      var ss = getSpreadsheet();
      var photoSheet = getPhotoboothSheet(ss);
      var maxRows = photoSheet.getMaxRows();
      var lastRow = getLastContentRow(photoSheet);
      var deletedRows = 0;
      if (maxRows > lastRow + 20) {
        deletedRows = maxRows - (lastRow + 20);
        photoSheet.deleteRows(lastRow + 21, deletedRows);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        lastRow: lastRow,
        maxRows: photoSheet.getMaxRows(),
        deletedRows: deletedRows
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Check if renaming spreadsheet was requested
    if (e && e.parameter && e.parameter.action === 'rename_spreadsheet') {
      var currentName = renameSpreadsheetToSMAppDatabase();
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        spreadsheetName: currentName
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Check if Game Room media was requested via GET URL
    if (e && e.parameter && (e.parameter.action === 'gameroom_media' || e.parameter.action === 'get_gameroom_media' || e.parameter.tab === 'Game_Room_Media')) {
      var grItems = readGameRoomMediaFromSheet(e.parameter.cardId, e.parameter.all === 'true' || e.parameter.dev === 'true');
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        count: grItems.length,
        items: grItems
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var photos = readPhotosFromSheet();
    if (photos.length === 0) {
      photos = readPhotosFromDrive();
    }
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      count: photos.length,
      photos: photos
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // ==========================================
    // ACTION: IMPORT ALL PHOTOS FROM GOOGLE DRIVE FOLDER
    // ==========================================
    if (data.action === 'import' || data.action === 'import_folder') {
      var targetFolder = data.folderId || '16piBJbrJu3wpUfR3JD2_tjQHI_Uw_z0D';
      var targetCard = data.cardId || '';
      var importResult = importPhotosFromAlbum(targetFolder, targetCard);
      return ContentService.createTextOutput(JSON.stringify(importResult)).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // ACTION 1: DELETE MEDIA ROW FROM SPREADSHEET
    // ==========================================
    if (data.action === 'delete') {
      var targetId = String(data.id || '').trim();
      if (!targetId) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'No ID provided for deletion.'
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var ss = getSpreadsheet();
      var sheetNames = data.source ? [data.source, 'Photobooth_Photos', 'Developer', 'Users', 'Photobooth'] : ['Photobooth_Photos', 'Developer', 'Users', 'Photobooth'];
      var deleted = false;
      var deletedSheet = '';

      for (var s = 0; s < sheetNames.length; s++) {
        var sheet = ss.getSheetByName(sheetNames[s]);
        if (!sheet) continue;

        var values = sheet.getDataRange().getValues();
        if (values.length <= 1) continue;

        // Search rows from bottom to top to preserve index safety
        for (var r = values.length - 1; r >= 1; r--) {
          var row = values[r];
          var match = false;
          for (var c = 0; c < row.length; c++) {
            var val = String(row[c]).trim();
            if (val === targetId || (val.length > 5 && targetId.includes(val)) || (targetId.length > 5 && val.includes(targetId))) {
              match = true;
              break;
            }
          }
          if (match) {
            sheet.deleteRow(r + 1); // 1-indexed in Google Sheets
            deleted = true;
            deletedSheet = sheet.getName();
            break;
          }
        }
        if (deleted) break;
      }

      // If targetId is a Google Drive file ID, trash the file as well
      try {
        if (targetId && targetId.length > 15 && !targetId.includes(' ')) {
          DriveApp.getFileById(targetId).setTrashed(true);
        }
      } catch (_) {}

      return ContentService.createTextOutput(JSON.stringify({
        status: deleted ? 'success' : 'not_found',
        message: deleted ? ('Row with ID ' + targetId + ' deleted from ' + deletedSheet) : ('ID ' + targetId + ' not found in spreadsheet'),
        deletedId: targetId
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // ACTION 2: LIST ALL PHOTOS
    // ==========================================
    if (data.action === 'list' || data.action === 'get_photos') {
      var photos = readPhotosFromSheet();
      if (photos.length === 0) {
        photos = readPhotosFromDrive();
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        count: photos.length,
        photos: photos
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // ACTION 2B: RENAME SPREADSHEET TO "SM App Database"
    // ==========================================
    if (data.action === 'rename_spreadsheet') {
      var currentName = renameSpreadsheetToSMAppDatabase();
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        spreadsheetName: currentName
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // ACTION 2C: LIST / QUERY GAME ROOM MEDIA
    // ==========================================
    if (data.action === 'gameroom_media' || data.action === 'get_gameroom_media') {
      var grItems = readGameRoomMediaFromSheet(data.cardId, data.all === true || data.dev === true);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        count: grItems.length,
        items: grItems
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // ACTION 2D: UPLOAD GAME ROOM MEDIA (SAVED TO "Game Room Media" DRIVE FOLDER & "Game_Room_Media" TAB)
    // ==========================================
    if (data.action === 'upload_gameroom_media' || data.action === 'upload_game_room_media') {
      var rawFileData = data.file || data.image || data.data;
      if (!rawFileData) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'No file data provided.'
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var cardIdTag = data.cardId ? String(data.cardId).trim() : '';
      var uploaderName = String(data.uploaderName || '').trim();
      var title = String(data.title || '').trim();
      var type = String(data.type || 'map').trim();
      var targetScreen = String(data.targetScreen || (type === 'map' ? 'table' : type === 'video' ? 'window' : 'frame')).trim();
      var visibility = String(data.visibility || 'public').toLowerCase().trim();
      if (visibility !== 'private') visibility = 'public';
      var mimeType = String(data.mimeType || 'image/jpeg').trim();

      var base64Data = rawFileData.replace(/^data:[^;]+;base64,/, '');
      var fileBytes = Utilities.base64Decode(base64Data);
      var timestampStr = data.timestamp || new Date().toISOString();

      var defaultExt = mimeType.includes('png') ? '.png' : mimeType.includes('webp') ? '.webp' : mimeType.includes('mp4') ? '.mp4' : mimeType.includes('webm') ? '.webm' : '.jpg';
      var rawFileName = String(data.fileName || '').trim();
      var fileName = rawFileName || ('GameRoom_' + (title ? title.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Media') + '_' + new Date().getTime() + defaultExt);
      if (!title) {
        title = rawFileName ? rawFileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') : ('Game Room Art ' + new Date().toLocaleDateString());
      }

      var blob = Utilities.newBlob(fileBytes, mimeType, fileName);
      var folder = getGameRoomFolder();
      var file = folder.createFile(blob);

      if (cardIdTag) {
        file.setDescription(cardIdTag + (uploaderName ? (' - ' + uploaderName) : '') + ' [' + visibility + ']');
      }

      // Allow anyone with the link to view the file
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      var directUrl = "https://lh3.googleusercontent.com/d/" + file.getId();
      var downloadUrl = "https://drive.google.com/uc?export=download&id=" + file.getId();
      var finalUrl = mimeType.startsWith('video/') ? downloadUrl : directUrl;

      // Permanently append row to Game_Room_Media tab
      var ss = getSpreadsheet();
      var gameSheet = getGameRoomSheet(ss);
      var targetRow = getLastContentRow(gameSheet) + 1;

      gameSheet.getRange(targetRow, 1, 1, 9).setNumberFormat('@').setValues([[
        timestampStr,
        cardIdTag,
        title,
        type,
        targetScreen,
        finalUrl,
        file.getId(),
        uploaderName,
        visibility
      ]]);

      var createdItem = {
        id: file.getId(),
        fileId: file.getId(),
        cardId: cardIdTag,
        title: title,
        type: type,
        targetScreen: targetScreen,
        url: finalUrl,
        downloadUrl: downloadUrl,
        uploaderName: uploaderName,
        visibility: visibility,
        timestamp: timestampStr
      };

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        fileId: file.getId(),
        url: finalUrl,
        downloadUrl: downloadUrl,
        item: createdItem
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // ACTION 2E: DELETE GAME ROOM MEDIA FROM SHEET & DRIVE
    // ==========================================
    if (data.action === 'delete_gameroom_media') {
      var targetId = String(data.id || data.fileId || '').trim();
      if (!targetId) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'No ID or fileId provided for deletion.'
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var ss = getSpreadsheet();
      var gameSheet = getGameRoomSheet(ss);
      var values = gameSheet.getDataRange().getValues();
      var deleted = false;

      // Search bottom to top
      for (var r = values.length - 1; r >= 1; r--) {
        var row = values[r];
        for (var c = 0; c < row.length; c++) {
          var val = String(row[c]).trim();
          if (val === targetId || (val.length > 5 && targetId.includes(val)) || (targetId.length > 5 && val.includes(targetId))) {
            gameSheet.deleteRow(r + 1);
            deleted = true;
            break;
          }
        }
        if (deleted) break;
      }

      // If targetId looks like a Google Drive file ID, trash the file
      try {
        if (targetId && targetId.length > 15 && !targetId.includes(' ')) {
          DriveApp.getFileById(targetId).setTrashed(true);
        }
      } catch (_) {}

      return ContentService.createTextOutput(JSON.stringify({
        status: deleted ? 'success' : 'not_found',
        message: deleted ? ('Media row ' + targetId + ' deleted from Game_Room_Media') : ('ID ' + targetId + ' not found in Game_Room_Media'),
        deletedId: targetId
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // ACTION 4: LINK / UPDATE CARD_ID IN SPREADSHEET
    // ==========================================
    if (data.action === 'link_card' || data.action === 'update_card') {
      var cardId = String(data.cardId || data.card_id || '').trim();
      var fileId = String(data.fileId || data.file_id || '').trim();
      var imageUrl = String(data.url || data.image_url || '').trim();

      if (!cardId) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'No cardId provided for linking.'
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var ss = getSpreadsheet();
      var photoSheet = getPhotoboothSheet(ss);
      // Use getDisplayValues to ensure dates are strings, never converted to JS Date objects!
      var values = photoSheet.getDataRange().getDisplayValues();
      var updated = false;
      var updatedRowIndex = -1;

      // Locate column indices from header
      var cardCol = 1, titleCol = 2, urlCol = 4, fileCol = 5;
      if (values.length > 0) {
        var hRow = values[0];
        for (var c = 0; c < hRow.length; c++) {
          var hName = String(hRow[c]).toLowerCase().replace(/[^a-z0-9]/g, '');
          if (hName.includes('card') || hName === 'id') cardCol = c;
          else if (hName.includes('title') || hName.includes('name')) titleCol = c;
          else if (hName.includes('url') || hName.includes('link') || hName.includes('image')) urlCol = c;
          else if (hName.includes('file')) fileCol = c;
        }
      }

      // Search bottom to top for matching row (by fileId, imageUrl, or most recent row with blank cardId)
      for (var r = values.length - 1; r >= 1; r--) {
        var row = values[r];
        var rFile = String(row[fileCol] || '').trim();
        var rUrl = String(row[urlCol] || '').trim();

        var isMatch = false;
        if (fileId && rFile === fileId) isMatch = true;
        else if (imageUrl && (rUrl === imageUrl || rUrl.includes(fileId))) isMatch = true;
        else if (!fileId && !imageUrl && !String(row[cardCol] || '').trim()) isMatch = true;

        if (isMatch) {
          var currentVal = String(row[cardCol] || '').trim();
          // Filter out accidental date string conversions if present
          if (currentVal.includes('GMT') || currentVal.includes('Pacific')) {
            currentVal = '';
          }
          var existingTokens = currentVal ? currentVal.split(/[,;\s]+/).map(function(t){return t.trim();}).filter(Boolean) : [];
          if (existingTokens.indexOf(cardId) === -1) {
            existingTokens.push(cardId);
          }
          var newVal = existingTokens.join(', ');
          var cardRange = photoSheet.getRange(r + 1, cardCol + 1);
          cardRange.setNumberFormat('@'); // Plain text format prevents auto date conversion
          cardRange.setValue(newVal);
          photoSheet.getRange(r + 1, titleCol + 1).setValue('Portal Photo #' + newVal);
          updated = true;
          updatedRowIndex = r + 1;
          break;
        }
      }

      // If no matching existing row found, append a new row at the actual last content row
      if (!updated) {
        var targetRow = getLastContentRow(photoSheet) + 1;
        photoSheet.getRange(targetRow, 1, 1, 6).setNumberFormat('@').setValues([[
          data.timestamp || new Date().toISOString(),
          cardId,
          'Portal Photo #' + cardId,
          'image',
          imageUrl || (fileId ? ("https://lh3.googleusercontent.com/d/" + fileId) : ''),
          fileId
        ]]);
        updated = true;
        updatedRowIndex = targetRow;
      }

      // Also set description on Google Drive file
      try {
        if (fileId) {
          var driveFile = DriveApp.getFileById(fileId);
          var prevDesc = driveFile.getDescription() || '';
          if (prevDesc.includes('GMT') || prevDesc.includes('Pacific')) prevDesc = '';
          var descTokens = prevDesc ? prevDesc.split(/[,;\s]+/).map(function(t){return t.trim();}).filter(Boolean) : [];
          if (descTokens.indexOf(cardId) === -1) descTokens.push(cardId);
          driveFile.setDescription(descTokens.join(', '));
        }
      } catch (_) {}

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        updated: updated,
        rowIndex: updatedRowIndex,
        cardId: cardId,
        fileId: fileId
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // ACTION 3: UPLOAD PHOTOBOOTH PHOTO TO DRIVE & LOG TO GOOGLE SHEET
    // ==========================================
    if (!data.image) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'No image data provided.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var cardIdTag = data.cardId ? String(data.cardId).trim() : '';
    // Support multiple cardIds array if passed
    if (!cardIdTag && Array.isArray(data.cardIds) && data.cardIds.length > 0) {
      cardIdTag = String(data.cardIds.find(Boolean) || '').trim();
    }

    var base64Data = data.image.replace(/^data:image\/(png|jpeg);base64,/, "");
    var imageBytes = Utilities.base64Decode(base64Data);
    var timestampStr = data.timestamp || new Date().toISOString();
    var fileName = cardIdTag ? ('Portal_Photo_' + cardIdTag + '_' + new Date().getTime() + '.jpg') : ('Portal_Photo_' + new Date().getTime() + '.jpg');
    var blob = Utilities.newBlob(imageBytes, 'image/jpeg', fileName);
    
    // Automatically creates or uses a "Portal Photos" folder in Google Drive
    var folders = DriveApp.getFoldersByName('Portal Photos');
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('Portal Photos');
    var file = folder.createFile(blob);
    if (cardIdTag) {
      file.setDescription(cardIdTag);
    }
    
    // Allow anyone with the link to view the image
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    var directUrl = "https://lh3.googleusercontent.com/d/" + file.getId();
    var downloadUrl = "https://drive.google.com/uc?export=download&id=" + file.getId();

    // 🌟 PERMANENTLY LOG TO GOOGLE SHEET "Photobooth_Photos" TAB 🌟
    try {
      var ss = getSpreadsheet();
      var photoSheet = getPhotoboothSheet(ss);

      // Support multi-card list
      var cardsToLog = (Array.isArray(data.cardIds) && data.cardIds.length > 0) ? data.cardIds.filter(Boolean) : [cardIdTag];
      cardsToLog = cardsToLog.map(function(c){return String(c||'').trim();}).filter(Boolean);
      var combinedCards = cardsToLog.join(', ');

      var targetRow = getLastContentRow(photoSheet) + 1;
      photoSheet.getRange(targetRow, 1, 1, 6).setNumberFormat('@').setValues([[
        timestampStr,
        combinedCards,
        combinedCards ? ('Portal Photo #' + combinedCards) : 'Portal Photo',
        'image',
        directUrl,
        file.getId()
      ]]);
    } catch (sheetLogErr) {
      Logger.log("Error logging photo to Photobooth_Photos tab: " + sheetLogErr);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      url: directUrl,
      downloadUrl: downloadUrl,
      fileId: file.getId(),
      cardId: cardIdTag
    })).setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
