// Cloud Functions for Firebase
// This file contains the sendTaskNotification function

const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
admin.initializeApp();

/**
 * Cloud Function: sendTaskNotification
 * Sends FCM push notifications to all assigned users (except creator)
 * when a task is created
 *
 * Triggered by: Client-side call from ViewTaskPage.js
 *
 * @param {Object} data - Task data from client
 * @param {string} data.projectId - Project ID
 * @param {string} data.projectName - Project name
 * @param {string} data.taskId - Task ID
 * @param {string} data.taskName - Task name/text
 * @param {string} data.createdBy - Creator email
 * @param {string} data.createdByUID - Creator UID
 * @param {string} data.createdByName - Creator display name
 */
exports.sendTaskNotification = functions.https.onCall(
    async (data, context) => {
      // Verify user is authenticated
      if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "User must be authenticated to send notifications"
        );
      }

      try {
        const {
          projectId,
          projectName,
          taskId,
          taskName,
          createdBy,
          createdByUID,
          createdByName,
        } = data;

        // Validate required fields
        if (!projectId || !taskId || !taskName) {
          throw new functions.https.HttpsError(
              "invalid-argument",
              "Missing required fields: projectId, taskId, or taskName"
          );
        }

        // Get project document to find assigned users
        const projectDoc = await admin.firestore()
            .collection("projects")
            .doc(projectId)
            .get();

        if (!projectDoc.exists) {
          throw new functions.https.HttpsError(
              "not-found",
              "Project not found"
          );
        }

        const projectData = projectDoc.data();
        const assignedUsers = projectData.users || [];

        // Get all user documents to retrieve FCM tokens
        const usersSnapshot = await admin.firestore()
            .collection("users")
            .get();

        // Filter users: assigned to project AND have FCM token
        // AND not the creator
        const targetUsers = [];
        usersSnapshot.forEach((userDoc) => {
          const userData = userDoc.data();
          const userUID = userDoc.id;

          // Check if user is assigned to project, has FCM token,
          // and is not the creator
          if (
            assignedUsers.includes(userUID) &&
            userData.fcmToken &&
            userUID !== createdByUID
          ) {
            targetUsers.push({
              uid: userUID,
              fcmToken: userData.fcmToken,
            });
          }
        });

        // If no target users, return early
        if (targetUsers.length === 0) {
          console.log(
              "No users to notify (no FCM tokens or all are creators)"
          );
          return {success: true, notified: 0};
        }

        // Prepare notification payload
        const notificationTitle = "New Task Created";
        const notificationBody = `${createdByName} created: ${taskName}`;

        // Create notification messages for all target users
        const messages = targetUsers.map((user) => ({
          token: user.fcmToken,
          notification: {
            title: notificationTitle,
            body: notificationBody,
          },
          data: {
            projectId: projectId,
            projectName: projectName || "Project",
            taskId: taskId,
            taskName: taskName,
            createdBy: createdBy,
            createdByUID: createdByUID,
            createdByName: createdByName || createdBy,
            type: "task_created",
          },
          webpush: {
            fcmOptions: {
              link: `/view/${projectId}/${
                encodeURIComponent(projectName || "Project")
              }`,
            },
          },
        }));

        // Send notifications in batches (FCM allows up to 500 per batch)
        const batchSize = 500;
        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < messages.length; i += batchSize) {
          const batch = messages.slice(i, i + batchSize);

          try {
            const response = await admin.messaging().sendAll(batch);
            successCount += response.successCount;
            failureCount += response.failureCount;

            // Log failures for debugging
            if (response.failureCount > 0) {
              response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                  console.error(
                      `Failed to send to ${batch[idx].token}:`,
                      resp.error
                  );
                }
              });
            }
          } catch (error) {
            console.error("Error sending notification batch:", error);
            failureCount += batch.length;
          }
        }

        console.log(
            `Notifications sent: ${successCount} success, ` +
            `${failureCount} failures`
        );

        return {
          success: true,
          notified: successCount,
          failed: failureCount,
          total: targetUsers.length,
        };
      } catch (error) {
        console.error("Error in sendTaskNotification:", error);

        // Re-throw HttpsError as-is
        if (error instanceof functions.https.HttpsError) {
          throw error;
        }

        // Wrap other errors
        throw new functions.https.HttpsError(
            "internal",
            "An error occurred while sending notifications",
            error.message
        );
      }
    }
);
