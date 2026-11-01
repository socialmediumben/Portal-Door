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

// One-time authorization trigger function - select this in Apps Script and click Run
function testAuthorization() {
  var ss = getSpreadsheet();
  var sheet = getPhotoboothSheet(ss);
  DriveApp.getRootFolder();
  Logger.log("Authorization Successful! Connected to Sheet: " + ss.getName() + " | Tab: " + sheet.getName());
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

// GET handler: Returns all photos as JSON (prefers Sheet, falls back to Drive)
function doGet(e) {
  try {
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

      // If multiple cards were tagged, log a row for each card, or one row for single/empty card
      var cardsToLog = (Array.isArray(data.cardIds) && data.cardIds.length > 0) ? data.cardIds.filter(Boolean) : [cardIdTag];
      if (cardsToLog.length === 0) cardsToLog = [''];

      cardsToLog.forEach(function(cId) {
        var cleanCId = String(cId || '').trim();
        photoSheet.appendRow([
          timestampStr,
          cleanCId,
          cleanCId ? ('Portal Photo #' + cleanCId) : 'Portal Photo',
          'image',
          directUrl,
          file.getId()
        ]);
      });
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
