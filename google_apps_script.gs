/**
 * PORTAL-DOOR - Google Apps Script Backend (v6.2)
 * 
 * Capabilities:
 * 1. Uploads Photobooth photos to Google Drive "Portal Photos" folder and returns direct image links.
 * 2. Deletes media rows from Google Sheet ("Developer", "Users", or "Photobooth" tabs) when "-" is pressed on kiosk.
 * 
 * IMPORTANT - ONE-TIME AUTHORIZATION STEP:
 * Because this script now accesses Google Sheets in addition to Google Drive:
 * 1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1vwXuw-TBYxUXKXUSipa2drArRNXZuKNwbXFhxcVbIc0/edit
 * 2. Go to Extensions > Apps Script.
 * 3. Replace all code in Code.gs with this file.
 * 4. In the top toolbar dropdown (next to "Debug"), select "testAuthorization".
 * 5. Click "Run" ▶️.
 * 6. Google will show "Authorization Required". Click "Review Permissions" > choose your account > "Advanced" > "Go to Untitled project (unsafe)" > "Allow".
 * 7. Click Deploy > Manage deployments > click pencil icon > Version: "New version" > Deploy!
 */

// One-time authorization trigger function - select this in Apps Script and click Run
function testAuthorization() {
  var ss;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById('1vwXuw-TBYxUXKXUSipa2drArRNXZuKNwbXFhxcVbIc0');
  } catch (_) {
    ss = SpreadsheetApp.openById('1vwXuw-TBYxUXKXUSipa2drArRNXZuKNwbXFhxcVbIc0');
  }
  DriveApp.getRootFolder();
  Logger.log("Authorization Successful! Connected to Sheet: " + ss.getName());
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

      var ss;
      try {
        ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById('1vwXuw-TBYxUXKXUSipa2drArRNXZuKNwbXFhxcVbIc0');
      } catch (e1) {
        ss = SpreadsheetApp.openById('1vwXuw-TBYxUXKXUSipa2drArRNXZuKNwbXFhxcVbIc0');
      }

      // Order of tabs to check for the ID
      var sheetNames = data.source ? [data.source, 'Developer', 'Users', 'Photobooth'] : ['Developer', 'Users', 'Photobooth'];
      var deleted = false;
      var deletedSheet = '';

      for (var s = 0; s < sheetNames.length; s++) {
        var sheet = ss.getSheetByName(sheetNames[s]);
        if (!sheet) continue;

        var values = sheet.getDataRange().getValues();
        if (values.length <= 1) continue;

        // Locate ID column from header row
        var idCol = 0;
        var header = values[0];
        for (var c = 0; c < header.length; c++) {
          var h = String(header[c]).toLowerCase();
          if (h === 'id' || h.includes('id') || h.includes('card')) {
            idCol = c;
            break;
          }
        }

        // Search rows from bottom to top to preserve index safety
        for (var r = values.length - 1; r >= 1; r--) {
          if (String(values[r][idCol]).trim() === targetId) {
            sheet.deleteRow(r + 1); // 1-indexed in Google Sheets
            deleted = true;
            deletedSheet = sheet.getName();
            break;
          }
        }
        if (deleted) break;
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: deleted ? 'success' : 'not_found',
        message: deleted ? ('Row with ID ' + targetId + ' deleted from ' + deletedSheet) : ('ID ' + targetId + ' not found in spreadsheet'),
        deletedId: targetId
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // ACTION 2: UPLOAD PHOTOBOOTH PHOTO TO DRIVE
    // ==========================================
    var base64Data = data.image.replace(/^data:image\/(png|jpeg);base64,/, "");
    var imageBytes = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(imageBytes, 'image/jpeg', 'Portal_Photo_' + new Date().getTime() + '.jpg');
    
    // Automatically creates or uses a "Portal Photos" folder in Google Drive
    var folders = DriveApp.getFoldersByName('Portal Photos');
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('Portal Photos');
    var file = folder.createFile(blob);
    
    // Allow anyone with the link to view the image
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    var directUrl = "https://lh3.googleusercontent.com/d/" + file.getId();
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      url: directUrl,
      fileId: file.getId()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
