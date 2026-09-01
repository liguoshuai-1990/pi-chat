package com.pichat.android.ui.screen

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pichat.android.data.model.ChatMessage
import com.pichat.android.data.model.ImageAttachment
import com.pichat.android.data.model.MessageRole
import com.pichat.android.data.model.MessageStatus
import com.pichat.android.data.model.SessionInfo
import com.pichat.android.data.model.ToolCall
import com.pichat.android.data.model.ToolCallState
import com.pichat.android.data.network.ConnectionState
import com.pichat.android.ui.theme.*
import com.pichat.android.ui.viewmodel.ChatViewModel
import kotlinx.coroutines.launch

private val suggestionPrompts = listOf(
    "列出当前目录的文件" to "列出当前目录下的所有文件，并告诉我这是什么项目",
    "总结这个项目" to "阅读 README 或主要源文件，然后用一段话总结这个项目是做什么的",
    "代码审查" to "帮我看看当前目录有没有什么可以改进的地方"
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ChatScreen(viewModel: ChatViewModel) {
    val messages by viewModel.messages.collectAsState()
    val sessions by viewModel.sessions.collectAsState()
    val isStreaming by viewModel.isStreaming.collectAsState()
    val connState by viewModel.connectionState.collectAsState()
    val sessionTitle by viewModel.currentSessionTitle.collectAsState()
    val serverUrl by viewModel.serverUrl.collectAsState()

    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val coroutineScope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    var inputText by remember { mutableStateOf("") }
    var attachments by remember { mutableStateOf<List<ImageAttachment>>(emptyList()) }
    var showSettings by remember { mutableStateOf(false) }

    val context = LocalContext.current
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
                connState = connState,
                onNewSession = {
                    viewModel.newSession()
                    coroutineScope.launch { drawerState.close() }
                },
                onSelectSession = { session ->
                    viewModel.switchSession(session)
                    coroutineScope.launch { drawerState.close() }
                },
                onReconnect = { viewModel.reconnect() },
                onOpenSettings = {
                    coroutineScope.launch { drawerState.close() }
                    showSettings = true
                }
            )
        }
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Text(
                            sessionTitle,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Medium
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = { coroutineScope.launch { drawerState.open() } }) {
                            Icon(Icons.Default.Menu, contentDescription = "打开历史记录")
                        }
                    },
                    actions = {
                        IconButton(onClick = { showSettings = true }) {
                            Icon(Icons.Default.Settings, contentDescription = "后端配置")
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Bg,
                        titleContentColor = TextPrimary,
                        navigationIconContentColor = TextPrimary,
                        actionIconContentColor = TextPrimary
                    )
                )
            },
            bottomBar = {
                Composer(
                    inputText = inputText,
                    isStreaming = isStreaming,
                    hasAttachments = attachments.isNotEmpty(),
                    onInputChange = { inputText = it },
                    onAttach = {
                        imagePicker.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                        )
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
                    onAbort = { viewModel.abort() }
                )
            },
            containerColor = Bg
        ) { paddingValues ->
            if (messages.isEmpty()) {
                EmptyState(
                    onSuggestion = { inputText = it },
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                )
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp)
                ) {
                    items(messages, key = { it.id }) { message ->
                        MessageBubble(message)
                    }
                }
            }
        }
    }

    if (showSettings) {
        SettingsDialog(
            serverUrl = serverUrl,
            onDismiss = { showSettings = false },
            onSave = { url, token ->
                viewModel.reconnect(url, token)
                showSettings = false
            }
        )
    }
}

@Composable
private fun HistoryDrawer(
    sessions: List<SessionInfo>,
    connState: ConnectionState,
    onNewSession: () -> Unit,
    onSelectSession: (SessionInfo) -> Unit,
    onReconnect: () -> Unit,
    onOpenSettings: () -> Unit
) {
    var searchText by remember { mutableStateOf("") }

    ModalDrawerSheet(
        drawerContainerColor = SidebarBg,
        modifier = Modifier.width(300.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.statusBars)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "对话记录",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = TextPrimary
                )
                Row {
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "后端配置", tint = TextSecondary)
                    }
                    IconButton(onClick = onNewSession) {
                        Icon(Icons.Default.Add, contentDescription = "新对话", tint = Accent)
                    }
                }
            }

            OutlinedButton(
                onClick = onNewSession,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp),
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, Border),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = TextPrimary)
            ) {
                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text("新对话", fontSize = 14.sp)
            }

            Spacer(Modifier.height(8.dp))

            OutlinedTextField(
                value = searchText,
                onValueChange = { searchText = it },
                placeholder = { Text("搜索会话…", color = TextDim, fontSize = 13.sp) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp),
                shape = RoundedCornerShape(10.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Bg,
                    unfocusedContainerColor = Bg,
                    focusedBorderColor = TextDim,
                    unfocusedBorderColor = Border,
                    focusedTextColor = TextPrimary,
                    unfocusedTextColor = TextPrimary
                )
            )

            Spacer(Modifier.height(8.dp))

            val filtered = remember(sessions, searchText) {
                val q = searchText.trim()
                if (q.isEmpty()) sessions
                else sessions.filter {
                    (it.sessionName ?: it.firstUser ?: it.name).contains(q, ignoreCase = true)
                }
            }

            LazyColumn(modifier = Modifier.weight(1f)) {
                items(filtered, key = { it.file }) { session ->
                    val label = session.sessionName ?: session.firstUser ?: session.name
                    NavigationDrawerItem(
                        label = {
                            Text(
                                label,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                color = TextPrimary,
                                fontSize = 13.sp
                            )
                        },
                        selected = false,
                        onClick = { onSelectSession(session) },
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                        colors = NavigationDrawerItemDefaults.colors(
                            unselectedContainerColor = Color.Transparent,
                            selectedContainerColor = BgHover
                        )
                    )
                }
            }

            HorizontalDivider(color = Border)
            Column(modifier = Modifier.padding(16.dp)) {
                ConnectionStatus(connState = connState, onReconnect = onReconnect)
                Spacer(Modifier.height(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("pi-chat · Android", fontSize = 11.sp, color = TextDim)
                    Text("v${com.pichat.android.BuildConfig.VERSION_NAME}", fontSize = 11.sp, color = TextDim)
                }
            }
        }
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
private fun EmptyState(onSuggestion: (String) -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("π", fontSize = 48.sp, fontWeight = FontWeight.Bold, color = Accent)
        Spacer(Modifier.height(16.dp))
        Text("有什么可以帮你？", fontSize = 24.sp, fontWeight = FontWeight.Medium, color = TextPrimary)
        Spacer(Modifier.height(12.dp))
        Text(
            "我是 pi 编程助手，可以读写文件、运行命令、改代码。在下方输入你的需求开始。",
            fontSize = 14.sp,
            lineHeight = 22.sp,
            color = TextSecondary,
            modifier = Modifier.padding(horizontal = 32.dp)
        )
        Spacer(Modifier.height(24.dp))
        FlowRow(
            modifier = Modifier.padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.Center,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            suggestionPrompts.forEach { (label, prompt) ->
                SuggestionChip(
                    onClick = { onSuggestion(prompt) },
                    label = { Text(label, fontSize = 12.sp, color = TextSecondary) },
                    shape = RoundedCornerShape(18.dp),
                    colors = SuggestionChipDefaults.suggestionChipColors(
                        containerColor = BgInput
                    ),
                    border = BorderStroke(1.dp, Border)
                )
            }
        }
    }
}

@Composable
private fun Composer(
    inputText: String,
    isStreaming: Boolean,
    hasAttachments: Boolean,
    onInputChange: (String) -> Unit,
    onAttach: () -> Unit,
    onSend: () -> Unit,
    onSteer: () -> Unit,
    onAbort: () -> Unit
) {
    Surface(
        color = Bg,
        modifier = Modifier
            .fillMaxWidth()
            .imePadding()
            .navigationBarsPadding()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.Bottom
        ) {
            Surface(
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(22.dp),
                color = BgInput,
                border = BorderStroke(1.dp, if (isStreaming) Danger else Border)
            ) {
                Row(verticalAlignment = Alignment.Bottom) {
                    IconButton(onClick = onAttach, modifier = Modifier.size(40.dp)) {
                        Icon(
                            Icons.Outlined.AttachFile,
                            contentDescription = "添加附件",
                            tint = TextSecondary
                        )
                    }
                    OutlinedTextField(
                        value = inputText,
                        onValueChange = onInputChange,
                        placeholder = { Text("给 pi 发消息…", color = TextDim) },
                        modifier = Modifier
                            .weight(1f)
                            .padding(vertical = 2.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent,
                            focusedBorderColor = Color.Transparent,
                            unfocusedBorderColor = Color.Transparent,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary,
                            cursorColor = Accent
                        ),
                        maxLines = 4
                    )
                }
            }

            Spacer(Modifier.width(8.dp))

            if (isStreaming) {
                Button(
                    onClick = onSteer,
                    enabled = inputText.isNotBlank(),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Accent,
                        disabledContainerColor = BgHover,
                        disabledContentColor = TextDim
                    ),
                    contentPadding = PaddingValues(horizontal = 12.dp),
                    modifier = Modifier.height(40.dp)
                ) {
                    Text("插入指令", fontSize = 12.sp)
                }
                Spacer(Modifier.width(8.dp))
                IconButton(
                    onClick = onAbort,
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(Danger)
                ) {
                    Icon(Icons.Default.Stop, contentDescription = "中止", tint = Color.White)
                }
            } else {
                val canSend = inputText.isNotBlank() || hasAttachments
                IconButton(
                    onClick = onSend,
                    enabled = canSend,
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(if (canSend) Accent else BgHover)
                ) {
                    Icon(
                        Icons.Default.ArrowUpward,
                        contentDescription = "发送",
                        tint = if (canSend) Color.White else TextDim
                    )
                }
            }
        }
    }
}

@Composable
fun MessageBubble(message: ChatMessage) {
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
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextDim
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    timeText,
                    fontSize = 11.sp,
                    color = TextDim
                )
            }
            Column(
                modifier = Modifier
                    .widthIn(max = 300.dp)
                    .clip(
                        RoundedCornerShape(
                            topStart = 16.dp,
                            topEnd = 16.dp,
                            bottomStart = 16.dp,
                            bottomEnd = 4.dp
                        )
                    )
                    .background(UserBubble)
                    .padding(horizontal = 14.dp, vertical = 10.dp)
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

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(bottom = 2.dp)
        ) {
            Text(
                "pi",
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = TextDim
            )
            Spacer(Modifier.width(6.dp))
            Text(
                timeText,
                fontSize = 11.sp,
                color = TextDim
            )
        }
        Spacer(Modifier.height(4.dp))
        AssistantContent(message)
    }
}

@Composable
private fun AssistantContent(message: ChatMessage) {
    if (message.thinkingContent.isNotEmpty()) {
        ThinkingBlock(message.thinkingContent, message.isThinking, message.timestamp)
        Spacer(Modifier.height(8.dp))
    }

    // Tool execution blocks with their own timestamps.
    if (message.toolCalls.isNotEmpty()) {
        message.toolCalls.forEach { tool ->
            ToolCallBlock(tool)
            Spacer(Modifier.height(8.dp))
        }
    }

    if (message.content.isNotEmpty()) {
        Text(
            text = message.content,
            color = TextPrimary,
            fontSize = 14.sp,
            lineHeight = 22.sp
        )
    } else if (message.status == MessageStatus.STREAMING && message.toolCalls.isEmpty()) {
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
    }
}

@Composable
private fun ThinkingBlock(content: String, active: Boolean, timestamp: Long) {
    var expanded by remember { mutableStateOf(false) }
    val timeText = formatTimestamp(timestamp)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(ThinkingBg)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                if (active) "思考中…" else "思考过程",
                fontSize = 13.sp,
                color = if (active) Accent else TextSecondary,
                fontWeight = if (active) FontWeight.Medium else FontWeight.Normal
            )
            Spacer(Modifier.weight(1f))
            if (timeText.isNotEmpty()) {
                Text(timeText, fontSize = 11.sp, color = TextDim)
                Spacer(Modifier.width(6.dp))
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
                content,
                fontSize = 13.sp,
                lineHeight = 20.sp,
                color = TextSecondary,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)
            )
        }
    }
}

@Composable
private fun ToolCallBlock(tool: ToolCall) {
    var expanded by remember { mutableStateOf(false) }
    val startTime = formatTimestamp(tool.startedAt)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(ToolBg)
            .border(androidx.compose.foundation.BorderStroke(1.dp, Border), RoundedCornerShape(10.dp))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Build,
                contentDescription = null,
                tint = Accent,
                modifier = Modifier.size(14.dp)
            )
            Spacer(Modifier.width(6.dp))
            Text(
                tool.name.ifEmpty { "工具" },
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = TextPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false)
            )
            Spacer(Modifier.width(8.dp))
            if (startTime.isNotEmpty()) {
                Text(startTime, fontSize = 11.sp, color = TextDim)
                Spacer(Modifier.width(6.dp))
            }
            val stateText = when (tool.state) {
                ToolCallState.RUNNING -> "执行中…"
                ToolCallState.DONE -> "完成"
                ToolCallState.ERROR -> "错误"
            }
            Text(
                stateText,
                fontSize = 11.sp,
                color = if (tool.state == ToolCallState.ERROR) Danger else TextSecondary,
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(BgHover)
                    .padding(horizontal = 8.dp, vertical = 2.dp)
            )
            Spacer(Modifier.width(4.dp))
            Icon(
                if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                contentDescription = null,
                tint = TextDim,
                modifier = Modifier.size(16.dp)
            )
        }
        AnimatedVisibility(visible = expanded) {
            Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 0.dp)) {
                if (tool.args.isNotEmpty()) {
                    Text(
                        tool.args,
                        fontSize = 12.sp,
                        lineHeight = 18.sp,
                        color = TextSecondary,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                }
                if (tool.output.isNotEmpty()) {
                    HorizontalDivider(color = Border)
                    Text(
                        tool.output,
                        fontSize = 12.sp,
                        lineHeight = 18.sp,
                        color = Color(0xFFCFCFCF),
                        modifier = Modifier.padding(vertical = 10.dp)
                    )
                }
            }
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

@OptIn(ExperimentalMaterial3Api::class)
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
        title = { Text("后端配置", color = TextPrimary, fontSize = 17.sp) },
        text = {
            Column {
                Text(
                    "配置 Pi Gateway 服务地址与访问 Token。",
                    fontSize = 13.sp,
                    color = TextSecondary
                )
                Spacer(Modifier.height(16.dp))
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
                Spacer(Modifier.height(12.dp))
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
                    "客户端版本：v${com.pichat.android.BuildConfig.VERSION_NAME}",
                    fontSize = 11.sp,
                    color = TextDim
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(url.trim(), token.trim().ifEmpty { null }) }) {
                Text("保存并连接", color = Accent)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("取消", color = TextSecondary)
            }
        }
    )
}

// Reads a picked image Uri and returns a base64 ImageAttachment (or null on failure).
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