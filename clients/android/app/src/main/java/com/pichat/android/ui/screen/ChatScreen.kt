package com.pichat.android.ui.screen

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.pichat.android.data.model.ChatMessage
import com.pichat.android.data.model.ImageAttachment
import com.pichat.android.data.model.MessageRole
import com.pichat.android.data.model.MessageStatus
import com.pichat.android.data.model.ModelInfo
import com.pichat.android.data.model.SessionInfo
import com.pichat.android.data.model.ToolCall
import com.pichat.android.data.model.ToolCallState
import com.pichat.android.data.network.ConnectionState
import com.pichat.android.ui.theme.*
import com.pichat.android.ui.viewmodel.ChatViewModel
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.coroutines.launch

private data class SuggestionPrompt(val icon: String, val label: String, val prompt: String)

private val suggestionPrompts = listOf(
    SuggestionPrompt("📂", "列出目录文件", "列出当前目录下的所有文件，并告诉我这是什么项目"),
    SuggestionPrompt("📝", "总结这个项目", "阅读 README 或主要源文件，然后用一段话总结这个项目是做什么的"),
    SuggestionPrompt("🔍", "代码审查", "帮我看看当前目录有没有什么可以改进的地方")
)

private val thinkingLevels = listOf(
    Triple("off", "Off", "关闭思考"),
    Triple("minimal", "Minimal", "极简思考"),
    Triple("low", "Low", "低推理深度"),
    Triple("medium", "Medium", "中等推理深度"),
    Triple("high", "High", "高推理深度"),
    Triple("max", "Max", "最大推理深度")
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ChatScreen(viewModel: ChatViewModel) {
    val context = LocalContext.current
    val messages by viewModel.messages.collectAsState()
    val sessions by viewModel.sessions.collectAsState()
    val isStreaming by viewModel.isStreaming.collectAsState()
    val connState by viewModel.connectionState.collectAsState()
    val sessionTitle by viewModel.currentSessionTitle.collectAsState()
    val serverUrl by viewModel.serverUrl.collectAsState()
    val currentSessionFile by viewModel.currentSessionFile.collectAsState()
    val currentModel by viewModel.currentModel.collectAsState()
    val availableModels by viewModel.availableModels.collectAsState()
    val thinkingLevel by viewModel.thinkingLevel.collectAsState()
    val currentCwd by viewModel.currentCwd.collectAsState()
    val serverConfig by viewModel.serverConfig.collectAsState()

    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val coroutineScope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    var isRefreshing by remember { mutableStateOf(false) }

    var inputText by remember { mutableStateOf("") }
    var attachments by remember { mutableStateOf<List<ImageAttachment>>(emptyList()) }
    
    // Dialog states
    var showSettings by remember { mutableStateOf(false) }
    var showModelSelector by remember { mutableStateOf(false) }
    var showThinkingSelector by remember { mutableStateOf(false) }
    var showCwdDialog by remember { mutableStateOf(false) }
    var lightboxImage by remember { mutableStateOf<String?>(null) }

    val imagePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        uri?.let {
            val img = uriToImageAttachment(context, it)
            if (img != null) attachments = attachments + img
        }
    }

    LaunchedEffect(messages.size, messages.lastOrNull()?.content?.length) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            HistoryDrawer(
                sessions = sessions,
                currentSessionFile = currentSessionFile,
                isStreaming = isStreaming,
                connState = connState,
                onNewSession = {
                    viewModel.newSession()
                    coroutineScope.launch { drawerState.close() }
                },
                onSelectSession = { session ->
                    viewModel.switchSession(session)
                    coroutineScope.launch { drawerState.close() }
                },
                onDeleteSession = { file ->
                    viewModel.deleteSession(file)
                },
                onReconnect = { viewModel.reconnect() }
            )
        }
    ) {
        Scaffold(
            topBar = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Bg)
                        .windowInsetsPadding(WindowInsets.statusBars)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp)
                            .padding(horizontal = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(
                            onClick = { coroutineScope.launch { drawerState.open() } },
                            modifier = Modifier.size(40.dp)
                        ) {
                            Icon(Icons.Default.Menu, contentDescription = "打开历史记录", tint = TextPrimary)
                        }

                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .padding(horizontal = 4.dp, vertical = 2.dp),
                            verticalArrangement = Arrangement.Center
                        ) {
                            Text(
                                text = sessionTitle.ifEmpty { "新对话" },
                                fontSize = 14.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = TextPrimary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Spacer(Modifier.height(3.dp))
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(5.dp)
                            ) {
                                // CWD Pill
                                TopBarPill(
                                    icon = {
                                        Icon(
                                            Icons.Outlined.Folder,
                                            contentDescription = null,
                                            tint = TextSecondary,
                                            modifier = Modifier.size(11.dp)
                                        )
                                    },
                                    label = formatCwdDisplay(currentCwd, serverConfig?.home),
                                    onClick = { showCwdDialog = true }
                                )

                                // Model Pill
                                val modelDisplayName = currentModel?.name ?: currentModel?.id ?: "选择模型"
                                val isDefaultModel = currentModel?.isDefault == true || (serverConfig?.defaultModel?.id != null && currentModel?.id == serverConfig?.defaultModel?.id)
                                TopBarPill(
                                    icon = {
                                        Icon(
                                            Icons.Outlined.SmartToy,
                                            contentDescription = null,
                                            tint = Accent,
                                            modifier = Modifier.size(11.dp)
                                        )
                                    },
                                    label = modelDisplayName,
                                    badge = if (isDefaultModel) "★ 默认" else null,
                                    onClick = {
                                        viewModel.refreshModels()
                                        showModelSelector = true
                                    }
                                )

                                // Thinking Pill
                                TopBarPill(
                                    icon = {
                                        Icon(
                                            Icons.Outlined.Psychology,
                                            contentDescription = null,
                                            tint = Color(0xFFC4B5FD),
                                            modifier = Modifier.size(11.dp)
                                        )
                                    },
                                    label = thinkingLevel.replaceFirstChar { it.uppercase() },
                                    onClick = { showThinkingSelector = true }
                                )
                            }
                        }

                        // Export chat action
                        IconButton(
                            onClick = {
                                val md = viewModel.exportChatMarkdown()
                                if (md.isNotEmpty()) {
                                    copyToClipboard(context, "pi-chat 记录", md)
                                    shareText(context, "pi-chat 对话记录", md)
                                } else {
                                    Toast.makeText(context, "当前无对话记录可导出", Toast.LENGTH_SHORT).show()
                                }
                            },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                Icons.Outlined.Share,
                                contentDescription = "导出对话",
                                tint = TextSecondary,
                                modifier = Modifier.size(18.dp)
                            )
                        }

                        // Settings action
                        IconButton(
                            onClick = { showSettings = true },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(
                                Icons.Default.Settings,
                                contentDescription = "后端配置",
                                tint = TextSecondary,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                    HorizontalDivider(color = Border)
                }
            },
            bottomBar = {
                Composer(
                    inputText = inputText,
                    attachments = attachments,
                    isStreaming = isStreaming,
                    onInputChange = { inputText = it },
                    onAttach = {
                        imagePicker.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                        )
                    },
                    onRemoveAttachment = { index ->
                        attachments = attachments.toMutableList().apply { removeAt(index) }
                    },
                    onSend = {
                        viewModel.sendMessage(inputText, attachments)
                        inputText = ""
                        attachments = emptyList()
                    },
                    onSteer = {
                        if (inputText.isNotBlank()) {
                            viewModel.sendSteer(inputText)
                            inputText = ""
                        }
                    },
                    onAbort = { viewModel.abort() },
                    onImageClick = { lightboxImage = it }
                )
            },
            containerColor = Bg
        ) { paddingValues ->
            if (messages.isEmpty()) {
                EmptyState(
                    currentModel = currentModel,
                    thinkingLevel = thinkingLevel,
                    onSuggestion = {
                        viewModel.sendMessage(it)
                    },
                    onChangeModel = {
                        viewModel.refreshModels()
                        showModelSelector = true
                    },
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                )
            } else {
                PullToRefreshBox(
                    isRefreshing = isRefreshing,
                    onRefresh = {
                        if (!isRefreshing) {
                            isRefreshing = true
                            coroutineScope.launch {
                                viewModel.refreshCurrentSession()
                                kotlinx.coroutines.delay(500)
                                isRefreshing = false
                            }
                        }
                    },
                    modifier = Modifier.fillMaxSize().padding(paddingValues)
                ) {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        items(messages, key = { it.id }) { message ->
                            MessageBubble(
                                message = message,
                                onImageClick = { lightboxImage = it },
                                onRetry = {
                                    if (message.role == MessageRole.USER) {
                                        viewModel.sendMessage(message.content, message.images)
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    // Dialogs & Modals
    if (showSettings) {
        SettingsDialog(
            serverUrl = serverUrl,
            onDismiss = { showSettings = false },
            onSave = { url, token ->
                viewModel.reconnect(url, token, currentCwd)
                showSettings = false
            }
        )
    }

    if (showModelSelector) {
        ModelSelectorDialog(
            models = availableModels,
            currentModel = currentModel,
            defaultModelId = serverConfig?.defaultModel?.id,
            onDismiss = { showModelSelector = false },
            onSelect = { provider, modelId ->
                viewModel.setModel(provider, modelId)
                showModelSelector = false
            }
        )
    }

    if (showThinkingSelector) {
        ThinkingLevelDialog(
            currentLevel = thinkingLevel,
            onDismiss = { showThinkingSelector = false },
            onSelect = { level ->
                viewModel.setThinkingLevel(level)
                showThinkingSelector = false
            }
        )
    }

    if (showCwdDialog) {
        CwdDialog(
            currentCwd = currentCwd,
            homeDir = serverConfig?.home,
            onDismiss = { showCwdDialog = false },
            onConfirm = { newPath ->
                viewModel.changeCwd(newPath)
                showCwdDialog = false
            }
        )
    }

    if (lightboxImage != null) {
        LightboxModal(
            imageDataUrl = lightboxImage!!,
            onDismiss = { lightboxImage = null }
        )
    }
}

@Composable
private fun TopBarPill(
    icon: @Composable () -> Unit,
    label: String,
    badge: String? = null,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(6.dp),
        color = BgHover,
        border = BorderStroke(1.dp, Border),
        modifier = Modifier.height(22.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(3.dp)
        ) {
            icon()
            Text(
                label,
                fontSize = 11.sp,
                fontWeight = FontWeight.Normal,
                color = TextSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (badge != null) {
                Text(
                    badge,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFFF59E0B),
                    modifier = Modifier
                        .clip(RoundedCornerShape(3.dp))
                        .background(Color(0xFFF59E0B).copy(alpha = 0.15f))
                        .padding(horizontal = 3.dp, vertical = 0.5.dp)
                )
            }
        }
    }
}

@Composable
private fun HistoryDrawer(
    sessions: List<SessionInfo>,
    currentSessionFile: String?,
    isStreaming: Boolean,
    connState: ConnectionState,
    onNewSession: () -> Unit,
    onSelectSession: (SessionInfo) -> Unit,
    onDeleteSession: (String) -> Unit,
    onReconnect: () -> Unit
) {
    val context = LocalContext.current
    var searchText by remember { mutableStateOf("") }
    var sessionToDelete by remember { mutableStateOf<SessionInfo?>(null) }

    ModalDrawerSheet(
        drawerContainerColor = SidebarBg,
        modifier = Modifier.width(280.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.statusBars)
        ) {
            // Top: + 新对话 button
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 8.dp)
            ) {
                Surface(
                    onClick = onNewSession,
                    shape = RoundedCornerShape(10.dp),
                    color = Color.Transparent,
                    border = BorderStroke(1.dp, Border),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(38.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.Add,
                            contentDescription = null,
                            tint = TextPrimary,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "新对话",
                            fontSize = 13.5.sp,
                            fontWeight = FontWeight.Medium,
                            color = TextPrimary
                        )
                    }
                }
            }

            // Compact Search Bar matching Web
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 2.dp)
                    .height(34.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Bg)
                    .border(1.dp, Border, RoundedCornerShape(8.dp))
                    .padding(horizontal = 8.dp),
                contentAlignment = Alignment.CenterStart
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Search,
                        contentDescription = "搜索",
                        tint = TextDim,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(Modifier.width(6.dp))
                    BasicTextField(
                        value = searchText,
                        onValueChange = { searchText = it },
                        singleLine = true,
                        textStyle = TextStyle(
                            color = TextPrimary,
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.Normal
                        ),
                        cursorBrush = SolidColor(Accent),
                        modifier = Modifier.weight(1f),
                        decorationBox = { innerTextField ->
                            if (searchText.isEmpty()) {
                                Text(
                                    "搜索会话…",
                                    color = TextDim,
                                    fontSize = 12.5.sp
                                )
                            }
                            innerTextField()
                        }
                    )
                    if (searchText.isNotEmpty()) {
                        IconButton(
                            onClick = { searchText = "" },
                            modifier = Modifier.size(20.dp)
                        ) {
                            Icon(
                                Icons.Default.Close,
                                contentDescription = "清除",
                                tint = TextDim,
                                modifier = Modifier.size(12.dp)
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(6.dp))

            val filtered = remember(sessions, searchText) {
                val q = searchText.trim()
                if (q.isEmpty()) sessions
                else sessions.filter {
                    (it.sessionName ?: it.firstUser ?: it.name).contains(q, ignoreCase = true)
                }
            }

            if (filtered.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .padding(top = 32.dp),
                    contentAlignment = Alignment.TopCenter
                ) {
                    Text(
                        if (searchText.isEmpty()) "没有会话记录" else "未找到匹配会话",
                        color = TextDim,
                        fontSize = 12.5.sp
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 6.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    items(filtered, key = { it.file }) { session ->
                        val isSelected = currentSessionFile != null && (
                            session.file == currentSessionFile ||
                            session.file.trimStart('.', '/', '~') == currentSessionFile.trimStart('.', '/', '~')
                        )
                        val label = session.sessionName ?: session.firstUser ?: session.name
                        val timeStr = formatSessionTimestamp(session.timestamp)
                        val isRunning = isStreaming && isSelected

                        Surface(
                            onClick = { onSelectSession(session) },
                            shape = RoundedCornerShape(8.dp),
                            color = if (isSelected) BgHover else Color.Transparent,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 8.dp, vertical = 7.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                // Accent left indicator for active session
                                if (isSelected) {
                                    Box(
                                        modifier = Modifier
                                            .size(width = 3.dp, height = 24.dp)
                                            .clip(RoundedCornerShape(1.5.dp))
                                            .background(Accent)
                                    )
                                    Spacer(Modifier.width(6.dp))
                                }

                                Column(modifier = Modifier.weight(1f)) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Text(
                                            text = label,
                                            fontSize = 13.sp,
                                            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                            color = TextPrimary,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.weight(1f, fill = false)
                                        )

                                        if (isRunning) {
                                            Row(
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(999.dp))
                                                    .background(Accent.copy(alpha = 0.15f))
                                                    .border(0.5.dp, Accent.copy(alpha = 0.3f), RoundedCornerShape(999.dp))
                                                    .padding(horizontal = 5.dp, vertical = 1.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(3.dp)
                                            ) {
                                                Box(
                                                    modifier = Modifier
                                                        .size(5.dp)
                                                        .clip(CircleShape)
                                                        .background(Accent)
                                                )
                                                Text(
                                                    "运行中",
                                                    fontSize = 9.5.sp,
                                                    fontWeight = FontWeight.Medium,
                                                    color = Accent
                                                )
                                            }
                                        }
                                    }

                                    Spacer(Modifier.height(2.dp))

                                    val metaText = buildString {
                                        if (timeStr.isNotEmpty()) {
                                            append(timeStr)
                                            append(" · ")
                                        }
                                        append("${session.messageCount} 条")
                                    }
                                    Text(
                                        text = metaText,
                                        fontSize = 11.sp,
                                        color = TextDim,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }

                                // Delete session action
                                IconButton(
                                    onClick = { sessionToDelete = session },
                                    modifier = Modifier.size(24.dp)
                                ) {
                                    Icon(
                                        Icons.Outlined.DeleteOutline,
                                        contentDescription = "删除会话",
                                        tint = TextDim,
                                        modifier = Modifier.size(15.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            HorizontalDivider(color = Border)

            // Sidebar Bottom: Status + Web-like Links + Version
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp)
                    .navigationBarsPadding()
            ) {
                ConnectionStatus(connState = connState, onReconnect = onReconnect)
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            text = "pi.dev",
                            fontSize = 11.sp,
                            color = TextSecondary,
                            modifier = Modifier.clickable {
                                try {
                                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://pi.dev"))
                                    context.startActivity(intent)
                                } catch (_: Exception) {}
                            }
                        )
                        Text("·", fontSize = 11.sp, color = TextDim)
                        Text(
                            text = "pi-web-chat",
                            fontSize = 11.sp,
                            color = TextSecondary,
                            modifier = Modifier.clickable {
                                try {
                                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/liguoshuai-1990/pi-web-chat"))
                                    context.startActivity(intent)
                                } catch (_: Exception) {}
                            }
                        )
                    }

                    Text(
                        text = "Android v${com.pichat.android.BuildConfig.VERSION_NAME}",
                        fontSize = 11.sp,
                        color = TextDim
                    )
                }
            }
        }
    }

    // Delete confirmation dialog
    if (sessionToDelete != null) {
        val s = sessionToDelete!!
        val title = s.sessionName ?: s.firstUser ?: s.name
        AlertDialog(
            onDismissRequest = { sessionToDelete = null },
            title = {
                Text(
                    "删除会话",
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 16.sp,
                    color = TextPrimary
                )
            },
            text = {
                Text(
                    "确定要删除此会话记录吗？\n「$title」\n删除后不可恢复。",
                    color = TextSecondary,
                    fontSize = 13.sp,
                    lineHeight = 18.sp
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        sessionToDelete = null
                        onDeleteSession(s.file)
                    }
                ) {
                    Text("删除", color = Danger, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                }
            },
            dismissButton = {
                TextButton(onClick = { sessionToDelete = null }) {
                    Text("取消", color = TextSecondary, fontSize = 13.sp)
                }
            },
            containerColor = BgInput,
            shape = RoundedCornerShape(14.dp)
        )
    }
}

private fun formatSessionTimestamp(timestampStr: String?): String {
    if (timestampStr.isNullOrBlank()) return ""
    return try {
        val epochMs = timestampStr.toLongOrNull()
        val instant = if (epochMs != null) {
            java.time.Instant.ofEpochMilli(epochMs)
        } else {
            java.time.Instant.parse(timestampStr)
        }
        val zonedDateTime = instant.atZone(java.time.ZoneId.systemDefault())
        val now = java.time.ZonedDateTime.now()
        val formatter = if (zonedDateTime.year == now.year) {
            java.time.format.DateTimeFormatter.ofPattern("M月d日 HH:mm")
        } else {
            java.time.format.DateTimeFormatter.ofPattern("yyyy/M/d HH:mm")
        }
        zonedDateTime.format(formatter)
    } catch (_: Exception) {
        ""
    }
}

@Composable
private fun ConnectionStatus(connState: ConnectionState, onReconnect: () -> Unit) {
    val (dotColor, label) = when (connState) {
        ConnectionState.CONNECTED -> Accent to "已连接"
        ConnectionState.CONNECTING -> Warning to "连接中…"
        ConnectionState.ERROR -> Danger to "连接失败（点按重连）"
        ConnectionState.DISCONNECTED -> Danger to "已断开（点按重连）"
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(enabled = connState != ConnectionState.CONNECTED, onClick = onReconnect)
            .padding(vertical = 4.dp)
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(dotColor)
        )
        Spacer(Modifier.width(8.dp))
        Text(label, fontSize = 12.sp, color = TextSecondary)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EmptyState(
    currentModel: ModelInfo?,
    thinkingLevel: String,
    onSuggestion: (String) -> Unit,
    onChangeModel: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // π avatar badge
        Box(
            modifier = Modifier
                .size(54.dp)
                .clip(CircleShape)
                .background(Accent.copy(alpha = 0.15f))
                .border(1.5.dp, Accent, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Text("π", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Accent)
        }

        Spacer(Modifier.height(14.dp))
        Text("有什么可以帮你？", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
        Spacer(Modifier.height(8.dp))
        Text(
            "我是 pi 编程助手，可以读写文件、运行命令、改代码。在下方输入你的需求开始，或打开历史会话继续。",
            fontSize = 13.sp,
            lineHeight = 20.sp,
            color = TextSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 16.dp)
        )
        
        Spacer(Modifier.height(20.dp))

        // Empty Model Banner matching Web client
        Surface(
            shape = RoundedCornerShape(14.dp),
            color = SidebarBg,
            border = BorderStroke(1.dp, Border),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("🤖", fontSize = 24.sp)
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("当前模型: ", fontSize = 11.sp, color = TextDim)
                        Text(
                            currentModel?.name ?: currentModel?.id ?: "默认模型",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TextPrimary
                        )
                        if (currentModel?.isDefault == true) {
                            Spacer(Modifier.width(6.dp))
                            Text(
                                "★ 默认",
                                fontSize = 10.sp,
                                color = Color(0xFFF59E0B),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(Color(0xFFF59E0B).copy(alpha = 0.15f))
                                    .padding(horizontal = 4.dp, vertical = 1.dp)
                            )
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("🧠 思考: ${thinkingLevel.replaceFirstChar { it.uppercase() }}", fontSize = 11.sp, color = TextSecondary)
                        if (currentModel?.supportsImages == true) {
                            Text("· 👁️ 视觉", fontSize = 11.sp, color = TextSecondary)
                        }
                        Text("· 🛠️ 工具", fontSize = 11.sp, color = TextSecondary)
                    }
                }
                OutlinedButton(
                    onClick = onChangeModel,
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(1.dp, Border),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Accent)
                ) {
                    Text("切换模型", fontSize = 12.sp)
                }
            }
        }

        Spacer(Modifier.height(20.dp))

        // Suggestions
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            suggestionPrompts.forEach { s ->
                Surface(
                    onClick = { onSuggestion(s.prompt) },
                    shape = RoundedCornerShape(14.dp),
                    color = BgInput,
                    border = BorderStroke(1.dp, Border)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(s.icon, fontSize = 16.sp)
                        Text(
                            s.label,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            color = TextSecondary
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Composer(
    inputText: String,
    attachments: List<ImageAttachment>,
    isStreaming: Boolean,
    onInputChange: (String) -> Unit,
    onAttach: () -> Unit,
    onRemoveAttachment: (Int) -> Unit,
    onSend: () -> Unit,
    onSteer: () -> Unit,
    onAbort: () -> Unit,
    onImageClick: (String) -> Unit
) {
    Surface(
        color = Bg,
        modifier = Modifier
            .fillMaxWidth()
            .imePadding()
            .navigationBarsPadding()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 12.dp, top = 4.dp, end = 12.dp, bottom = 6.dp)
        ) {
            // Attachment preview strip
            if (attachments.isNotEmpty()) {
                LazyRow(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(attachments.size) { idx ->
                        val item = attachments[idx]
                        val bitmap = remember(item.data) { decodeBase64Bitmap(item.data) }
                        Box(
                            modifier = Modifier
                                .size(56.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .border(1.dp, Border, RoundedCornerShape(8.dp))
                                .clickable { onImageClick(item.data) }
                        ) {
                            if (bitmap != null) {
                                Image(
                                    bitmap = bitmap.asImageBitmap(),
                                    contentDescription = "附件缩略图",
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.fillMaxSize()
                                )
                            }
                            IconButton(
                                onClick = { onRemoveAttachment(idx) },
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .size(18.dp)
                                    .background(Color.Black.copy(alpha = 0.7f), CircleShape)
                            ) {
                                Icon(
                                    Icons.Default.Close,
                                    contentDescription = "删除附件",
                                    tint = Color.White,
                                    modifier = Modifier.size(10.dp)
                                )
                            }
                        }
                    }
                }
            }

            // Input bar container (matching web's .composer-inner)
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(22.dp),
                color = BgInput,
                border = BorderStroke(
                    1.dp,
                    if (isStreaming) Accent.copy(alpha = 0.6f) else Border
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 6.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.Bottom
                ) {
                    // Attachment paperclip button
                    IconButton(
                        onClick = onAttach,
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            Icons.Outlined.AttachFile,
                            contentDescription = "添加附件",
                            tint = TextSecondary,
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    // Text Input field
                    BasicTextField(
                        value = inputText,
                        onValueChange = onInputChange,
                        modifier = Modifier
                            .weight(1f)
                            .padding(horizontal = 6.dp, vertical = 6.dp)
                            .heightIn(min = 20.dp, max = 120.dp),
                        textStyle = TextStyle(
                            color = TextPrimary,
                            fontSize = 14.5.sp,
                            lineHeight = 20.sp,
                            fontFamily = FontFamily.Default
                        ),
                        cursorBrush = SolidColor(Accent),
                        decorationBox = { innerTextField ->
                            Box(
                                modifier = Modifier.fillMaxWidth(),
                                contentAlignment = Alignment.CenterStart
                            ) {
                                if (inputText.isEmpty()) {
                                    Text(
                                        "给 pi 发消息…",
                                        color = TextDim,
                                        fontSize = 14.5.sp
                                    )
                                }
                                innerTextField()
                            }
                        }
                    )

                    // Right action button
                    if (isStreaming) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            if (inputText.isNotBlank()) {
                                Button(
                                    onClick = onSteer,
                                    shape = RoundedCornerShape(14.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = Accent),
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                                    modifier = Modifier.height(30.dp)
                                ) {
                                    Text("插入指令", fontSize = 11.5.sp, fontWeight = FontWeight.Medium)
                                }
                            }
                            Box(
                                modifier = Modifier
                                    .size(32.dp)
                                    .clip(CircleShape)
                                    .background(Danger)
                                    .clickable(onClick = onAbort),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    Icons.Default.Stop,
                                    contentDescription = "中止",
                                    tint = Color.White,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    } else {
                        val canSend = inputText.isNotBlank() || attachments.isNotEmpty()
                        Box(
                            modifier = Modifier
                                .size(32.dp)
                                .clip(CircleShape)
                                .background(if (canSend) Accent else BgHover)
                                .clickable(enabled = canSend, onClick = onSend),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                Icons.Default.ArrowUpward,
                                contentDescription = "发送",
                                tint = if (canSend) Color.White else TextDim,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }

            // Hint footer matching web client
            Text(
                "pi 会执行命令与读写你的文件 —— 请注意操作内容。",
                fontSize = 11.sp,
                color = TextDim,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp, bottom = 2.dp)
            )
        }
    }
}

@Composable
fun MessageBubble(
    message: ChatMessage,
    onImageClick: (String) -> Unit,
    onRetry: () -> Unit
) {
    val context = LocalContext.current
    val isUser = message.role == MessageRole.USER
    val timeText = formatTimestamp(message.timestamp)

    if (isUser) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.End
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.End,
                modifier = Modifier.padding(end = 4.dp, bottom = 2.dp)
            ) {
                Text(
                    "user",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextDim
                )
                Spacer(Modifier.width(6.dp))
                Text(timeText, fontSize = 10.sp, color = TextDim)
            }

            // User attached images if any
            if (message.images.isNotEmpty()) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.padding(bottom = 6.dp)
                ) {
                    items(message.images) { img ->
                        val bitmap = remember(img.data) { decodeBase64Bitmap(img.data) }
                        if (bitmap != null) {
                            Image(
                                bitmap = bitmap.asImageBitmap(),
                                contentDescription = "发送的图片",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(80.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .border(1.dp, Border, RoundedCornerShape(8.dp))
                                    .clickable { onImageClick(img.data) }
                            )
                        }
                    }
                }
            }

            val userBubbleShape = RoundedCornerShape(
                topStart = 18.dp,
                topEnd = 18.dp,
                bottomStart = 18.dp,
                bottomEnd = 5.dp
            )
            Column(
                modifier = Modifier
                    .widthIn(max = 300.dp)
                    .background(
                        Brush.linearGradient(
                            colors = listOf(Color(0xFF26473F), Color(0xFF2F2F2F))
                        ),
                        userBubbleShape
                    )
                    .border(1.dp, Accent.copy(alpha = 0.35f), userBubbleShape)
                    .clickable {
                        copyToClipboard(context, "我的提问", message.content)
                        Toast.makeText(context, "已复制消息内容", Toast.LENGTH_SHORT).show()
                    }
                    .padding(horizontal = 14.dp, vertical = 11.dp)
            ) {
                Text(
                    text = message.content,
                    color = TextPrimary,
                    fontSize = 14.sp,
                    lineHeight = 21.sp
                )
            }
        }
        return
    }

    // Assistant Message
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 4.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(22.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.linearGradient(
                            colors = listOf(Accent, Color(0xFF0A6B55))
                        )
                    )
                    .border(1.dp, Accent.copy(alpha = 0.5f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text("π", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White)
            }
            Spacer(Modifier.width(6.dp))
            Text(
                "pi",
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = TextPrimary
            )
            Spacer(Modifier.width(6.dp))
            Text(timeText, fontSize = 10.sp, color = TextDim)
            if (message.turnDurationMs != null && message.turnDurationMs > 0) {
                Spacer(Modifier.width(6.dp))
                Text(
                    "⏱️ ${formatDuration(message.turnDurationMs)}",
                    fontSize = 10.sp,
                    color = Accent,
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(Accent.copy(alpha = 0.12f))
                        .padding(horizontal = 4.dp, vertical = 1.dp)
                )
            }
            Spacer(Modifier.weight(1f))
            if (message.content.isNotEmpty() || message.toolCalls.isNotEmpty()) {
                val fullTextToCopy = remember(message) {
                    if (message.content.isNotEmpty()) message.content
                    else message.toolCalls.joinToString("\n\n") { "${it.name}: ${it.output.ifEmpty { it.args }}" }
                }
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .clickable {
                            copyToClipboard(context, "pi 回答全文", fullTextToCopy)
                            Toast.makeText(context, "已复制回答全文", Toast.LENGTH_SHORT).show()
                        }
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Outlined.ContentCopy,
                        contentDescription = "复制全文",
                        tint = TextDim,
                        modifier = Modifier.size(12.dp)
                    )
                    Spacer(Modifier.width(3.dp))
                    Text("复制全文", fontSize = 11.sp, color = TextDim)
                }
            }
        }

        Spacer(Modifier.height(2.dp))
        AssistantContent(message)

        // Assistant action row (Copy response, etc.)
        if (message.content.isNotEmpty() && message.status != MessageStatus.STREAMING) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(BgHover)
                        .clickable {
                            copyToClipboard(context, "pi 回复", message.content)
                            Toast.makeText(context, "已复制回复内容", Toast.LENGTH_SHORT).show()
                        }
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Outlined.ContentCopy,
                        contentDescription = "复制回复",
                        tint = TextDim,
                        modifier = Modifier.size(13.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text("复制回复", fontSize = 11.sp, color = TextDim)
                }
            }
        }
    }
}

@Composable
private fun AssistantContent(message: ChatMessage) {
    if (message.thinkingContent.isNotEmpty() || message.isThinking) {
        ThinkingBlock(
            content = message.thinkingContent,
            active = message.isThinking,
            timestamp = message.timestamp,
            durationMs = message.thinkingDurationMs
        )
        Spacer(Modifier.height(8.dp))
    }

    // Tool execution blocks
    if (message.toolCalls.isNotEmpty()) {
        message.toolCalls.forEach { tool ->
            ToolCallBlock(tool)
            Spacer(Modifier.height(8.dp))
        }
    }

    if (message.content.isNotEmpty()) {
        FormattedMarkdownText(text = message.content)
    } else if (message.status == MessageStatus.STREAMING && message.toolCalls.isEmpty() && !message.isThinking) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .clip(RoundedCornerShape(10.dp))
                .background(ThinkingBg)
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(14.dp),
                color = Accent,
                strokeWidth = 2.dp
            )
            Spacer(Modifier.width(10.dp))
            Text("思考中…", fontSize = 13.sp, color = TextSecondary)
        }
    } else if (message.status == MessageStatus.ERROR && message.content.isEmpty()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .clip(RoundedCornerShape(10.dp))
                .background(Color(0xFF2A1515))
                .border(BorderStroke(1.dp, Color(0xFFEF4444).copy(alpha = 0.3f)), RoundedCornerShape(10.dp))
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            Text("⚠️ 生成失败，请检查模型或网络配置后重试", fontSize = 13.sp, color = Color(0xFFFCA5A5))
        }
    }
}

@Composable
private fun ThinkingBlock(content: String, active: Boolean, timestamp: Long, durationMs: Long? = null) {
    var userExpanded by remember { mutableStateOf<Boolean?>(null) }
    val expanded = userExpanded ?: active
    val durationText = formatDuration(durationMs)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(ThinkingBg)
            .border(
                BorderStroke(1.dp, if (active) Accent.copy(alpha = 0.4f) else Border),
                RoundedCornerShape(10.dp)
            )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { userExpanded = !expanded }
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("🧠", fontSize = 13.sp)
            Spacer(Modifier.width(6.dp))
            Text(
                if (active) "思考中…" else "思考过程",
                fontSize = 13.sp,
                color = if (active) Accent else TextSecondary,
                fontWeight = if (active) FontWeight.Medium else FontWeight.Normal
            )
            if (durationText.isNotEmpty()) {
                Spacer(Modifier.width(6.dp))
                Text(
                    if (active) durationText else "用时 $durationText",
                    fontSize = 11.sp,
                    color = if (active) Accent else Color(0xFFC4B5FD),
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(if (active) Accent.copy(alpha = 0.15f) else Color(0xFF8B5CF6).copy(alpha = 0.15f))
                        .padding(horizontal = 6.dp, vertical = 1.dp)
                )
            }
            Spacer(Modifier.weight(1f))
            if (!active && !expanded) {
                Text(
                    "展开",
                    fontSize = 11.sp,
                    color = TextDim,
                    modifier = Modifier.padding(end = 4.dp)
                )
            }
            Icon(
                if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                contentDescription = null,
                tint = TextDim,
                modifier = Modifier.size(16.dp)
            )
        }
        AnimatedVisibility(visible = expanded) {
            Text(
                content.ifEmpty { "正在生成思考过程…" },
                fontSize = 12.sp,
                lineHeight = 18.sp,
                fontFamily = FontFamily.Monospace,
                color = TextSecondary,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
            )
        }
    }
}

private fun parseToolSummary(name: String, args: String): String {
    if (args.isBlank()) return ""
    try {
        val json = Json.parseToJsonElement(args)
        if (json is JsonObject) {
            when (name.lowercase()) {
                "bash", "terminal", "sh" -> {
                    (json["command"] as? JsonPrimitive)?.content?.let { return it }
                    (json["cmd"] as? JsonPrimitive)?.content?.let { return it }
                }
                "read", "write", "edit", "ls" -> {
                    (json["path"] as? JsonPrimitive)?.content?.let { return it }
                    (json["file"] as? JsonPrimitive)?.content?.let { return it }
                }
                "grep", "find" -> {
                    val p = (json["pattern"] as? JsonPrimitive)?.content
                    val path = (json["path"] as? JsonPrimitive)?.content
                    if (p != null) return if (path != null) "$p in $path" else p
                }
            }
            for (key in listOf("command", "cmd", "path", "file", "pattern", "query", "url")) {
                val v = (json[key] as? JsonPrimitive)?.content
                if (!v.isNullOrBlank()) return v
            }
            if (json.size == 1) {
                val firstVal = json.values.firstOrNull()
                if (firstVal is JsonPrimitive && firstVal.content.isNotBlank()) {
                    return firstVal.content
                }
            }
        }
    } catch (_: Exception) {}
    return args.replace("\n", " ").trim()
}

private fun getToolCommandToCopy(name: String, args: String, output: String): String {
    val summary = parseToolSummary(name, args)
    if (summary.isNotEmpty()) return summary
    if (args.isNotBlank()) return args
    return output
}

@Composable
private fun ToolIconView(name: String, isRunning: Boolean) {
    val icon = when (name.lowercase()) {
        "bash", "terminal", "sh" -> Icons.Outlined.Terminal
        "read", "readfile" -> Icons.Outlined.Description
        "edit", "editfile" -> Icons.Outlined.Edit
        "write", "writefile" -> Icons.Outlined.Save
        else -> Icons.Outlined.Build
    }
    Box(
        modifier = Modifier
            .size(24.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(if (isRunning) Accent.copy(alpha = 0.2f) else Color(0xFF2B2B36)),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = name,
            tint = if (isRunning) Accent else TextSecondary,
            modifier = Modifier.size(14.dp)
        )
    }
}

@Composable
private fun ToolCallBlock(tool: ToolCall) {
    var userExpanded by remember(tool.id) { mutableStateOf(false) }
    val expanded = userExpanded
    val isRunning = tool.state == ToolCallState.RUNNING
    val context = LocalContext.current
    val durationText = formatDuration(tool.durationMs ?: if (tool.endedAt != null) tool.endedAt - tool.startedAt else null)
    val summaryText = remember(tool.name, tool.args) { parseToolSummary(tool.name, tool.args) }
    val cmdToCopy = remember(tool.name, tool.args, tool.output) { getToolCommandToCopy(tool.name, tool.args, tool.output) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(ToolBg)
            .border(
                BorderStroke(1.dp, if (isRunning) Accent.copy(alpha = 0.4f) else Border),
                RoundedCornerShape(10.dp)
            )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { userExpanded = !expanded }
                .padding(horizontal = 10.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ToolIconView(name = tool.name, isRunning = isRunning)
            Spacer(Modifier.width(8.dp))
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = tool.name.ifEmpty { "工具" },
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimary,
                    maxLines = 1
                )
                if (summaryText.isNotEmpty()) {
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = summaryText,
                        fontSize = 11.5.sp,
                        fontFamily = FontFamily.Monospace,
                        color = TextDim,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            Spacer(Modifier.width(8.dp))
            if (cmdToCopy.isNotEmpty()) {
                IconButton(
                    onClick = {
                        copyToClipboard(context, "${tool.name} 指令", cmdToCopy)
                        Toast.makeText(context, "已复制指令", Toast.LENGTH_SHORT).show()
                    },
                    modifier = Modifier.size(26.dp)
                ) {
                    Icon(
                        Icons.Outlined.ContentCopy,
                        contentDescription = "复制指令",
                        tint = TextDim,
                        modifier = Modifier.size(13.dp)
                    )
                }
                Spacer(Modifier.width(2.dp))
            }
            val stateText = when (tool.state) {
                ToolCallState.RUNNING -> if (durationText.isNotEmpty()) "执行中 · $durationText" else "执行中…"
                ToolCallState.DONE -> if (durationText.isNotEmpty()) "完成 · $durationText" else "完成"
                ToolCallState.ERROR -> if (durationText.isNotEmpty()) "失败 · $durationText" else "失败"
            }
            Text(
                text = stateText,
                fontSize = 10.5.sp,
                fontWeight = FontWeight.Medium,
                color = if (tool.state == ToolCallState.ERROR) Danger else if (isRunning) Accent else TextSecondary,
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(if (isRunning) Accent.copy(alpha = 0.15f) else BgHover)
                    .padding(horizontal = 7.dp, vertical = 2.dp)
            )
            Spacer(Modifier.width(4.dp))
            Icon(
                if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                contentDescription = if (expanded) "折叠" else "展开",
                tint = TextDim,
                modifier = Modifier.size(16.dp)
            )
        }
        AnimatedVisibility(visible = expanded) {
            Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) {
                if (tool.args.isNotEmpty()) {
                    Text(
                        "参数 / 指令",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = TextDim,
                        modifier = Modifier.padding(bottom = 2.dp)
                    )
                    Text(
                        tool.args,
                        fontSize = 12.sp,
                        fontFamily = FontFamily.Monospace,
                        lineHeight = 17.sp,
                        color = TextSecondary,
                        modifier = Modifier.padding(bottom = 6.dp)
                    )
                }
                if (tool.output.isNotEmpty()) {
                    HorizontalDivider(color = Border)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 6.dp, bottom = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "输出结果",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = TextDim
                        )
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .clickable {
                                    copyToClipboard(context, "${tool.name} 输出", tool.output)
                                    Toast.makeText(context, "已复制工具输出", Toast.LENGTH_SHORT).show()
                                }
                                .padding(horizontal = 4.dp, vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Outlined.ContentCopy,
                                contentDescription = "复制输出",
                                tint = TextDim,
                                modifier = Modifier.size(12.dp)
                            )
                            Spacer(Modifier.width(3.dp))
                            Text("复制", fontSize = 11.sp, color = TextDim)
                        }
                    }
                    Text(
                        tool.output,
                        fontSize = 11.5.sp,
                        fontFamily = FontFamily.Monospace,
                        lineHeight = 16.sp,
                        color = TextDim,
                        maxLines = 40,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.horizontalScroll(rememberScrollState())
                    )
                } else if (isRunning) {
                    Text(
                        "正在运行并等待输出…",
                        fontSize = 11.5.sp,
                        fontFamily = FontFamily.Monospace,
                        color = TextDim,
                        modifier = Modifier.padding(vertical = 4.dp)
                    )
                }
            }
        }
    }
}

private val INLINE_MD_REGEX = Regex("(`[^`\\n]+`|\\*\\*[^\\*\\n]+\\*\\*|__[^_\\n]+__|\\*[^\\*\\n]+\\*|_[^_\\n]+_|~~[^~\\n]+~~|\\[[^\\]\\n]+\\]\\([^)\\n]+\\))")

private fun buildAnnotatedMarkdownString(text: String): AnnotatedString {
    return buildAnnotatedString {
        var lastIdx = 0
        val matches = INLINE_MD_REGEX.findAll(text)
        for (m in matches) {
            val start = m.range.first
            val end = m.range.last + 1
            if (start > lastIdx) {
                append(text.substring(lastIdx, start))
            }
            val token = m.value
            when {
                token.startsWith("`") && token.endsWith("`") -> {
                    pushStyle(
                        SpanStyle(
                            fontFamily = FontFamily.Monospace,
                            background = Color(0xFF22222B),
                            color = Color(0xFF6EE7B7),
                            fontSize = 12.5.sp
                        )
                    )
                    append(token.removeSurrounding("`"))
                    pop()
                }
                (token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__")) -> {
                    pushStyle(SpanStyle(fontWeight = FontWeight.Bold, color = TextPrimary))
                    append(if (token.startsWith("**")) token.removeSurrounding("**") else token.removeSurrounding("__"))
                    pop()
                }
                (token.startsWith("*") && token.endsWith("*")) || (token.startsWith("_") && token.endsWith("_")) -> {
                    pushStyle(SpanStyle(fontStyle = FontStyle.Italic))
                    append(if (token.startsWith("*")) token.removeSurrounding("*") else token.removeSurrounding("_"))
                    pop()
                }
                token.startsWith("~~") && token.endsWith("~~") -> {
                    pushStyle(SpanStyle(textDecoration = TextDecoration.LineThrough, color = TextDim))
                    append(token.removeSurrounding("~~"))
                    pop()
                }
                token.startsWith("[") && token.contains("](") && token.endsWith(")") -> {
                    val linkTitle = token.substringAfter("[").substringBefore("]")
                    pushStyle(SpanStyle(color = Accent, textDecoration = TextDecoration.Underline))
                    append(linkTitle)
                    pop()
                }
                else -> {
                    append(token)
                }
            }
            lastIdx = end
        }
        if (lastIdx < text.length) {
            append(text.substring(lastIdx))
        }
    }
}

@Composable
private fun FormattedMarkdownText(text: String) {
    val context = LocalContext.current
    val parts = remember(text) { parseMarkdownSegments(text) }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        for (part in parts) {
            when (part) {
                is MarkdownSegment.Heading -> {
                    val fontSize = when (part.level) {
                        1 -> 20.sp
                        2 -> 18.sp
                        3 -> 16.sp
                        4 -> 15.sp
                        else -> 14.sp
                    }
                    val topPadding = when (part.level) {
                        1 -> 10.dp
                        2 -> 8.dp
                        3 -> 6.dp
                        else -> 4.dp
                    }
                    Text(
                        text = buildAnnotatedMarkdownString(part.text),
                        fontSize = fontSize,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary,
                        modifier = Modifier.padding(top = topPadding, bottom = 2.dp)
                    )
                }
                is MarkdownSegment.BulletItem -> {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 1.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Text(
                            "•",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = Accent,
                            modifier = Modifier.padding(start = 4.dp, end = 8.dp)
                        )
                        Text(
                            text = buildAnnotatedMarkdownString(part.text),
                            fontSize = 14.sp,
                            lineHeight = 21.sp,
                            color = TextPrimary,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
                is MarkdownSegment.NumberedItem -> {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 1.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Text(
                            "${part.number}.",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Accent,
                            modifier = Modifier.padding(start = 4.dp, end = 6.dp)
                        )
                        Text(
                            text = buildAnnotatedMarkdownString(part.text),
                            fontSize = 14.sp,
                            lineHeight = 21.sp,
                            color = TextPrimary,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
                is MarkdownSegment.Blockquote -> {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .width(3.dp)
                                .height(22.dp)
                                .clip(RoundedCornerShape(2.dp))
                                .background(Accent.copy(alpha = 0.6f))
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = buildAnnotatedMarkdownString(part.text),
                            fontSize = 13.5.sp,
                            fontStyle = FontStyle.Italic,
                            lineHeight = 20.sp,
                            color = TextSecondary
                        )
                    }
                }
                is MarkdownSegment.Divider -> {
                    HorizontalDivider(
                        color = Border,
                        thickness = 1.dp,
                        modifier = Modifier.padding(vertical = 6.dp)
                    )
                }
                is MarkdownSegment.CodeBlock -> {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFF141418))
                            .border(BorderStroke(1.dp, Border), RoundedCornerShape(8.dp))
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFF1E1E24))
                                .padding(horizontal = 10.dp, vertical = 5.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                part.lang.ifEmpty { "code" },
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace,
                                color = TextSecondary
                            )
                            Row(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .clickable {
                                        copyToClipboard(context, "代码片段", part.code)
                                        Toast.makeText(context, "已复制代码", Toast.LENGTH_SHORT).show()
                                    }
                                    .padding(horizontal = 6.dp, vertical = 2.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Outlined.ContentCopy,
                                    contentDescription = "复制代码",
                                    tint = TextDim,
                                    modifier = Modifier.size(12.dp)
                                )
                                Spacer(Modifier.width(3.dp))
                                Text("复制", fontSize = 11.sp, color = TextDim)
                            }
                        }
                        Text(
                            part.code,
                            fontSize = 12.sp,
                            fontFamily = FontFamily.Monospace,
                            lineHeight = 18.sp,
                            color = TextPrimary,
                            modifier = Modifier
                                .horizontalScroll(rememberScrollState())
                                .padding(10.dp)
                        )
                    }
                }
                is MarkdownSegment.Paragraph -> {
                    Text(
                        text = buildAnnotatedMarkdownString(part.text),
                        fontSize = 14.sp,
                        lineHeight = 22.sp,
                        color = TextPrimary
                    )
                }
            }
        }
    }
}

sealed class MarkdownSegment {
    data class Heading(val level: Int, val text: String) : MarkdownSegment()
    data class Paragraph(val text: String) : MarkdownSegment()
    data class BulletItem(val text: String) : MarkdownSegment()
    data class NumberedItem(val number: String, val text: String) : MarkdownSegment()
    data class Blockquote(val text: String) : MarkdownSegment()
    object Divider : MarkdownSegment()
    data class CodeBlock(val lang: String, val code: String) : MarkdownSegment()
}

private fun parseMarkdownSegments(raw: String): List<MarkdownSegment> {
    val result = mutableListOf<MarkdownSegment>()
    val lines = raw.lines()
    var inCode = false
    var codeLang = ""
    val codeBuffer = StringBuilder()
    val paraBuffer = StringBuilder()

    fun flushPara() {
        val t = paraBuffer.toString().trim()
        if (t.isNotEmpty()) {
            result.add(MarkdownSegment.Paragraph(t))
        }
        paraBuffer.clear()
    }

    for (line in lines) {
        if (line.startsWith("```")) {
            if (inCode) {
                result.add(MarkdownSegment.CodeBlock(codeLang, codeBuffer.toString().trimEnd()))
                codeBuffer.clear()
                inCode = false
            } else {
                flushPara()
                codeLang = line.removePrefix("```").trim()
                inCode = true
            }
            continue
        }

        if (inCode) {
            if (codeBuffer.isNotEmpty()) codeBuffer.append("\n")
            codeBuffer.append(line)
            continue
        }

        val trimmed = line.trim()
        if (trimmed.isEmpty()) {
            flushPara()
            continue
        }

        if (trimmed == "---" || trimmed == "***" || trimmed == "___") {
            flushPara()
            result.add(MarkdownSegment.Divider)
            continue
        }

        val headingMatch = Regex("^(#{1,6})\\s+(.*)$").matchEntire(trimmed)
        if (headingMatch != null) {
            flushPara()
            val level = headingMatch.groupValues[1].length
            val title = headingMatch.groupValues[2].trim()
            result.add(MarkdownSegment.Heading(level, title))
            continue
        }

        if (trimmed.startsWith(">")) {
            flushPara()
            val quoteText = trimmed.removePrefix(">").trim()
            result.add(MarkdownSegment.Blockquote(quoteText))
            continue
        }

        val bulletMatch = Regex("^[-*+]\\s+(.*)$").matchEntire(trimmed)
        if (bulletMatch != null) {
            flushPara()
            result.add(MarkdownSegment.BulletItem(bulletMatch.groupValues[1].trim()))
            continue
        }

        val numMatch = Regex("^(\\d+)\\.\\s+(.*)$").matchEntire(trimmed)
        if (numMatch != null) {
            flushPara()
            result.add(MarkdownSegment.NumberedItem(numMatch.groupValues[1], numMatch.groupValues[2].trim()))
            continue
        }

        if (paraBuffer.isNotEmpty()) paraBuffer.append("\n")
        paraBuffer.append(line)
    }

    if (inCode && codeBuffer.isNotEmpty()) {
        result.add(MarkdownSegment.CodeBlock(codeLang, codeBuffer.toString().trimEnd()))
    } else {
        flushPara()
    }

    return result
}

// Dialogs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ModelSelectorDialog(
    models: List<ModelInfo>,
    currentModel: ModelInfo?,
    defaultModelId: String?,
    onDismiss: () -> Unit,
    onSelect: (provider: String, modelId: String) -> Unit
) {
    var search by remember { mutableStateOf("") }
    val filtered = remember(models, search) {
        val q = search.trim().lowercase()
        if (q.isEmpty()) models
        else models.filter {
            (it.name ?: it.id).lowercase().contains(q) || (it.provider ?: "").lowercase().contains(q)
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = SidebarBg,
        title = {
            Column {
                Text("选择模型", color = TextPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = search,
                    onValueChange = { search = it },
                    placeholder = { Text("搜索模型…", color = TextDim, fontSize = 12.sp) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = BgInput,
                        unfocusedContainerColor = BgInput,
                        focusedBorderColor = Accent,
                        unfocusedBorderColor = Border,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    )
                )
            }
        },
        text = {
            if (filtered.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(140.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text("未发现可用模型", fontSize = 13.sp, color = TextDim)
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 360.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    items(filtered, key = { "${it.provider}_${it.id}" }) { m ->
                        val isSelected = m.id == currentModel?.id && (m.provider == null || m.provider == currentModel?.provider)
                        val isDefault = m.id == defaultModelId
                        Surface(
                            onClick = { onSelect(m.provider ?: "", m.id) },
                            shape = RoundedCornerShape(10.dp),
                            color = if (isSelected) BgHover else BgInput,
                            border = BorderStroke(1.dp, if (isSelected) Accent else Border),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            m.name ?: m.id,
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = TextPrimary
                                        )
                                        if (isDefault) {
                                            Spacer(Modifier.width(6.dp))
                                            Text(
                                                "★ 默认",
                                                fontSize = 10.sp,
                                                color = Color(0xFFF59E0B),
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(4.dp))
                                                    .background(Color(0xFFF59E0B).copy(alpha = 0.15f))
                                                    .padding(horizontal = 4.dp, vertical = 1.dp)
                                            )
                                        }
                                    }
                                    Spacer(Modifier.height(4.dp))
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        if (!m.provider.isNullOrEmpty()) {
                                            Text(
                                                m.provider,
                                                fontSize = 10.sp,
                                                color = TextDim,
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(4.dp))
                                                    .background(BgHover)
                                                    .padding(horizontal = 4.dp, vertical = 1.dp)
                                            )
                                        }
                                        if (m.reasoning) {
                                            Text("🧠 推理", fontSize = 10.sp, color = TextSecondary)
                                        }
                                        if (m.supportsImages) {
                                            Text("👁️ 视觉", fontSize = 10.sp, color = TextSecondary)
                                        }
                                        Text("🛠️ 工具", fontSize = 10.sp, color = TextSecondary)
                                    }
                                }
                                if (isSelected) {
                                    Icon(
                                        Icons.Default.Check,
                                        contentDescription = "已选择",
                                        tint = Accent,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("关闭", color = TextSecondary)
            }
        }
    )
}

@Composable
private fun ThinkingLevelDialog(
    currentLevel: String,
    onDismiss: () -> Unit,
    onSelect: (String) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = SidebarBg,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("🧠", fontSize = 18.sp)
                Spacer(Modifier.width(8.dp))
                Text("深度思考 / 推理级别", color = TextPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                thinkingLevels.forEach { (levelKey, levelLabel, desc) ->
                    val active = levelKey.equals(currentLevel, ignoreCase = true)
                    Surface(
                        onClick = { onSelect(levelKey) },
                        shape = RoundedCornerShape(10.dp),
                        color = if (active) BgHover else BgInput,
                        border = BorderStroke(1.dp, if (active) Accent else Border),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(levelLabel, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                                Text(desc, fontSize = 11.sp, color = TextDim)
                            }
                            if (active) {
                                Icon(Icons.Default.Check, contentDescription = null, tint = Accent, modifier = Modifier.size(18.dp))
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("取消", color = TextSecondary)
            }
        }
    )
}

@Composable
private fun CwdDialog(
    currentCwd: String,
    homeDir: String?,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    var pathInput by remember { mutableStateOf(currentCwd) }
    val quickDirs = listOf("~", "~/.pi", "/tmp")

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = SidebarBg,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Folder, contentDescription = null, tint = Accent, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text("切换工作目录", color = TextPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            }
        },
        text = {
            Column {
                Text("选择或输入 pi 代理运行的目标工作目录：", fontSize = 12.sp, color = TextSecondary)
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = pathInput,
                    onValueChange = { pathInput = it },
                    placeholder = { Text("/path/to/project", fontSize = 13.sp) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = BgInput,
                        unfocusedContainerColor = BgInput,
                        focusedBorderColor = Accent,
                        unfocusedBorderColor = Border,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    )
                )
                Spacer(Modifier.height(12.dp))
                Text("快捷选择：", fontSize = 11.sp, color = TextDim)
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    quickDirs.forEach { dir ->
                        Surface(
                            onClick = { pathInput = dir },
                            shape = RoundedCornerShape(8.dp),
                            color = BgInput,
                            border = BorderStroke(1.dp, Border)
                        ) {
                            Text(
                                dir,
                                fontSize = 11.sp,
                                color = TextSecondary,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(pathInput.trim()) },
                colors = ButtonDefaults.buttonColors(containerColor = Accent)
            ) {
                Text("确定切换")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("取消", color = TextSecondary)
            }
        }
    )
}

@Composable
private fun SettingsDialog(
    serverUrl: String,
    onDismiss: () -> Unit,
    onSave: (String, String?) -> Unit
) {
    var url by remember { mutableStateOf(serverUrl) }
    var token by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = SidebarBg,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Settings, contentDescription = null, tint = Accent, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text("后端配置", color = TextPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            }
        },
        text = {
            Column {
                Text(
                    "配置 Pi Gateway 服务地址与访问 Token。",
                    fontSize = 12.sp,
                    color = TextSecondary
                )
                Spacer(Modifier.height(14.dp))
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text("服务地址", fontSize = 12.sp) },
                    placeholder = { Text("http://10.0.2.2:3000", fontSize = 13.sp) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = BgInput,
                        unfocusedContainerColor = BgInput,
                        focusedBorderColor = Accent,
                        unfocusedBorderColor = Border,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary,
                        focusedLabelColor = Accent,
                        unfocusedLabelColor = TextSecondary
                    )
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = token,
                    onValueChange = { token = it },
                    label = { Text("访问 Token（可选）", fontSize = 12.sp) },
                    placeholder = { Text("网关开启鉴权时填写", fontSize = 13.sp) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = BgInput,
                        unfocusedContainerColor = BgInput,
                        focusedBorderColor = Accent,
                        unfocusedBorderColor = Border,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary,
                        focusedLabelColor = Accent,
                        unfocusedLabelColor = TextSecondary
                    )
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    "客户端版本：pi-chat · Android v${com.pichat.android.BuildConfig.VERSION_NAME}",
                    fontSize = 11.sp,
                    color = TextDim
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(url.trim(), token.trim().ifEmpty { null }) },
                colors = ButtonDefaults.buttonColors(containerColor = Accent)
            ) {
                Text("保存并连接")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("取消", color = TextSecondary)
            }
        }
    )
}

@Composable
private fun LightboxModal(imageDataUrl: String, onDismiss: () -> Unit) {
    val bitmap = remember(imageDataUrl) { decodeBase64Bitmap(imageDataUrl) }
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.9f)),
            contentAlignment = Alignment.Center
        ) {
            if (bitmap != null) {
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = "全屏预览",
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    contentScale = ContentScale.Fit
                )
            }
            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(16.dp)
                    .background(Color.Black.copy(alpha = 0.5f), CircleShape)
            ) {
                Icon(Icons.Default.Close, contentDescription = "关闭", tint = Color.White)
            }
        }
    }
}

// Helpers

private fun formatCwdDisplay(cwd: String?, home: String?): String {
    if (cwd.isNullOrEmpty() || cwd == "~") return "~"
    if (!home.isNullOrEmpty()) {
        if (cwd == home || cwd == "$home/") return "~"
        if (cwd.startsWith("$home/")) return "~/" + cwd.removePrefix("$home/")
    }
    val parts = cwd.split("/").filter { it.isNotEmpty() }
    return if (parts.isNotEmpty()) parts.last() else cwd
}

private fun formatDuration(ms: Long?): String {
    if (ms == null || ms < 0) return ""
    return when {
        ms < 1000 -> "${String.format(java.util.Locale.US, "%.1f", ms / 1000.0)}s"
        ms < 60_000 -> "${String.format(java.util.Locale.US, "%.1f", ms / 1000.0)}s"
        else -> {
            val mins = ms / 60_000
            val secs = (ms % 60_000) / 1000
            "${mins}m ${secs}s"
        }
    }
}

private fun formatTimestamp(ts: Long): String {
    if (ts <= 0) return ""
    return try {
        val zone = java.time.ZoneId.systemDefault()
        val dt = java.time.Instant.ofEpochMilli(ts).atZone(zone)
        val now = java.time.ZonedDateTime.now(zone)
        val pattern = if (dt.toLocalDate() == now.toLocalDate()) "HH:mm" else "MM-dd HH:mm"
        java.time.format.DateTimeFormatter.ofPattern(pattern).format(dt)
    } catch (e: Exception) {
        ""
    }
}

private fun copyToClipboard(context: Context, label: String, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    val clip = ClipData.newPlainText(label, text)
    clipboard.setPrimaryClip(clip)
}

private fun shareText(context: Context, title: String, text: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, title)
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(intent, "导出对话"))
}

private fun uriToImageAttachment(context: Context, uri: Uri): ImageAttachment? {
    return try {
        val resolver = context.contentResolver
        val mimeType = resolver.getType(uri) ?: "image/png"
        val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val encoded = Base64.encodeToString(bytes, Base64.NO_WRAP)
        ImageAttachment(type = "image", data = "data:$mimeType;base64,$encoded", mimeType = mimeType)
    } catch (e: Exception) {
        null
    }
}

private fun decodeBase64Bitmap(dataUrl: String): Bitmap? {
    return try {
        val base64 = if (dataUrl.contains(",")) dataUrl.substringAfter(",") else dataUrl
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    } catch (e: Exception) {
        null
    }
}
