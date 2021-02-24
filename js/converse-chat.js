function UrlParameters(host) {
    var data = {};

    this.converseHost = host || false;

    function getUrlStringPart(key, value) {
        return key + "=" + encodeURIComponent(value);
    }

    // Standard key=value parameter
    this.setParameter = function (param, value) {
        data[param] = {
            type: "standard",
            value: value
        };
    };

    this.getUrl = function () {
        var parameterKeys = Object.keys(data);
        var urlParameters = [];
        for (var i = 0; i < parameterKeys.length; i++) {
            if (!data.hasOwnProperty(parameterKeys[i])) {
                continue;
            }
            switch (data[parameterKeys[i]].type) {
                case "array":
                    for (var j = 0; j < data[parameterKeys[i]].value.length; j++) {
                        if (!data[parameterKeys[i]].value.hasOwnProperty(j)) {
                            continue;
                        }
                        urlParameters.push(getUrlStringPart(parameterKeys[i] + "[]", data[parameterKeys[i]].value[j]));
                    }
                    break;
                case "standard":
                default:
                    urlParameters.push(getUrlStringPart(parameterKeys[i], data[parameterKeys[i]].value));
            }
        }
        return this.converseHost + "?" + urlParameters.join("&");
    };
}

var ConverseUtil = {
    sid: null,
    getCookie: function (name) {
        var nameEq = name + "=";
        var ca = document.cookie.split(";");
        for (var i = 0; i < ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0) === " ") c = c.substring(1, c.length);
            if (c.indexOf(nameEq) === 0) return c.substring(nameEq.length, c.length);
        }
        return null;
    },

    isValidUrl: function (msg) {
        return msg.match(/^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\%\]@!\$&'\(\)\*\+,;=.]+$/ig);
    },

    putCookie: function (name, value) {
        document.cookie = name + "=" + value;
    },

    uuidV4: function () {
        let cryptoAPI;

        if (window.crypto && window.crypto.getRandomValues) {
            cryptoAPI = window.crypto;
        } else if (window.msCrypto && window.msCrypto.getRandomValues) {
            cryptoAPI = window.msCrypto;
        } else {
            throw "Unsupported browser";
        }

        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, function (c) {
            return (c ^ cryptoAPI.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16);
        });
    },

    localStorage: function (name, value) {
        if (!name) {
            name = "cSession";
        }

        try {
            if (!window.localStorage) {
                return undefined;
            }

            if (value) {
                window.localStorage[name] = value;
            }

            if (!value) {
                return window.localStorage[name];
            }
        } catch (e) {
            return undefined;
        }
    }
};

function ConverseWebClient(options) {
    this.host = options.host;
    this.converseHost = options.converseHost;
    this.botId = options.botId;
    this.user = options.user;
    this.tenant = options.tenant;
    this.startPhrase = options.start || options.startPhrase || null;
    this.baseContainer = options.container;
    this.showSettingsButton = typeof options.showSettingsButton === "boolean" ? options.showSettingsButton : true;
    this.showMinimizeButton = typeof options.showMinimizeButton === "boolean" ? options.showMinimizeButton : false;
    this.showMaximizeButton = typeof options.showMaximizeButton === "boolean" ? options.showMaximizeButton : false;
    this.showCloseButton = typeof options.showCloseButton === "boolean" ? options.showCloseButton : false;
    this.startMinimized = !!options.startMinimized;
    this.minimizeIcon = options.minimizeIcon || "fa-minus";
    this.maximizeIcon = options.maximizeIcon || "fa-window-maximize";
    this.closeIcon = options.closeIcon || "fa-times";
    this.sendCallback = options.sendCallback;
    this.receiveCallback = options.receiveCallback;
    this.hideCallback = options.hideCallback;
    this.title = options.title || "";
    this.FADE_TIME = options.FADE_TIME || 150; // ms
    this.REDATE_TIME = options.REDATE_TIME || 10; // minutes
    this.isTypingDelay = options.isTypingDelay || 2000; // milliseconds
    this.hideSendButton = options.hideSendButton || false;
    this.placeholder = options.placeholder || "Type a message...";
    this.disabledPlaceholder = options.disabledPlaceholder || "";
    this.sendButtonTitle = options.sendButtonTitle || "Send";
    this.serverUserImage = options.serverUserImage || "pb-circle-mark.png";
    this.reConnectDelay = options.reConnectDelay || 2000;
    this.connectedText = options.connectedText || "Chat Status: connected";
    this.disconnectedText = options.disconnectedText || "Chat Status: disconnected - trying to reconnect";
    this.showBrowseButton = typeof options.showBrowseButton === "boolean" ? options.showBrowseButton : true;
    this.showToolbar = typeof options.showToolbar === "boolean" ? options.showToolbar : false;
    this.downloadText = options.downloadText || "download";
    this.downloadErrorText = options.downloadErrorText || null;
    this.clientUserImage = options.clientUserImage || "";
    this.windowOpen = options.windowOpen || window.open;
    this.$baseTemplate = "";
    this.lastTimestamp = 0;
    this.lastDirection = "none";
    this.lastContainer = null;
    this.tryReconnect = false;
    this.allowHTML = typeof options.allowHTML === "boolean" ? options.allowHTML : false;
    this.incomingMessages = {};
    this.botOpened = false;
    this.isTyping = false;
    this.openRetries = options.openRetries || 5;
    this.openCount = 0;
    this.history = [];
}

ConverseWebClient.prototype.setReceiveCallback = function (callback) {
    this.receiveCallback = callback;
};

ConverseWebClient.prototype.setSendCallback = function (callback) {
    this.sendCallback = callback;
};

ConverseWebClient.prototype.initSocket = function () {
    let client = this;

    var events = {
        "text": client.onText.bind(client),
        "buttons": client.onButtons.bind(client),
        "card": client.onCard.bind(client),
        "buttonCard": client.onCardButton.bind(client),
        "quick_replies": client.onQuickReply.bind(client),
        "type_on": client.onTypeOn.bind(client),
        "type_off": client.onTypeOff.bind(client),
        "account_link_redirect": client.onAccountLinkRedirect.bind(client),
        "disconnect": client.onDisconnect.bind(client),
        "attachment": client.onAttachment.bind(client),
        "attached-text": client.onAttachedText.bind(client),
        "attached-error": client.onAttachedErrorText.bind(client),
        "connect": client.onConnect.bind(client)
    };

    var protocol = window.location.protocol.indexOf("https") > -1 ? "wss" : "ws";
    var url = new URL(client.host);

    client.socket = new WebSocket(protocol + "://" + url.host + "/channel/send?chat_id=" + client.user.chatid);

    client.socket.onmessage = function (messageEvent) {
        try {
            var msg = JSON.parse(messageEvent.data);
        } catch (e) {
            return;
        }

        if (!msg.type || !events[msg.type]) {
            console.error("Unrecognized event");
            return;
        }

        events[msg.type](msg.message);
    };

    client.socket.onopen = client.onConnect.bind(client);
    client.socket.onclose = client.onDisconnect.bind(client);

    return client.socket;
};

ConverseWebClient.init = function (opts, callback) {
    var client = new ConverseWebClient(opts),
        url = client.host + "/chat/init",
        chatId = ConverseUtil.localStorage(client.botId + "-chatid");

    if (chatId) {
        url += "?chat_id=" + chatId;
    }

    $.ajax({
        url: url,
        method: "POST",
        contentType: 'application/json; charset=utf-8',
        data: JSON.stringify(client.user),
        dataType: "json",
        success: function (res) {
            client.user.chatid = res.id;
            ConverseUtil.localStorage(client.botId + "-chatid", res.id);

            client.history = res.messages;
            client.initSocket();

            client._buildInterface();
            client.renderMain.call(client, typeof callback === "function" ? callback.bind(client, client) : null, res.messages);
        }
    });

    client._disableChatWindow();

    return client;
};

ConverseWebClient.prototype._buildInterface = function () {
    var wrapper = this;

    wrapper.$baseTemplate = $('<div class="cv-wrapper"></div>');

    var $popHead = $('<div id="cvChatHeader" class="cv-header"></div>');

    if (this.allowHTML) {
        $popHead.append($('<div id="cvChatTitle" class="cv-header__title"></div>').html(wrapper.title));
    } else {
        $popHead.append($('<div id="cvChatTitle" class="cv-header__title"></div>').text(wrapper.title));
    }

    var $btnGroup = $('<div class="cv-header__btn-group"></div>');

    $btnGroup.append($(
        '<span id="cvConnectionStatus" class="cv-connection-status">' +
        '<i id="cvConnectedIcon" aria-hidden="true" class="cv-icon fas fa-bolt cv--is-connected"></i>' +
        '<span id="cvConnectionMsg" aria-live="polite" class="sr-only"></span>' +
        '</span>'
    ));

    if (wrapper.showSettingsButton) {
        $btnGroup.append($(
            '<button type="button" id="cvSettingsDropdownBtn" data-toggle="dropdown" class="cv-btn cv-btn--dropdown" aria-controls="cvSettingsDropdown">' +
            '<span class="sr-only">Open the settings panel</span>' +
            '<i class="cv-icon fas fa-cog"></i>' +
            '</button>'
        ));
    }

    var $lst = $('<div id="cvSettingsDropdown" class="cv-settings-dropdown" aria-expanded="false"></div>');

    var $clearChat = $('<button type="button" id="cvClearChat" class="cv-btn cv-btn--clear-chat">Clear Chat</button>');

    $clearChat.click(function () {
        wrapper.clearChat();
    });

    $lst.append($clearChat);

    if (wrapper.showMinimizeButton) {
        $btnGroup.append($(
            '<button type="button" id="cvMinimizeChat" data-widget="minimize" class="cv-btn cv-btn--min-chat" aria-controls="cvChatContainer">' +
            '<span class="sr-only">Minimize chat window</span>' +
            '<i class="cv-icon fas ' + wrapper.minimizeIcon + '" aria-hidden="true"></i>' +
            '</button>'
        ));
    }

    if (wrapper.showMaximizeButton) {
        $btnGroup.append($(
            '<button type="button" id="cvMaximizeChat" data-widget="maximize" class="cv-btn cv-btn--max-chat" aria-controls="cvChatContainer">' +
            '<span class="sr-only">Maximize chat window</span>' +
            '<i class="cv-icon fas ' + wrapper.maximizeIcon + '" aria-hidden="true"></i>' +
            '</button>'
        ));
    }

    if (wrapper.showCloseButton) {
        $btnGroup.append($(
            '<button type="button" id="cvCloseChat" data-widget="remove" class="cv-btn cv-btn--close-chat">' +
            '<span class="sr-only">Close chat window</span>' +
            '<i class="pb-chat-maximize-icon fas ' + wrapper.closeIcon + '" aria-hidden="true"></i>' +
            '</button>'
        ));
    }

    var $changeOrientation = $('<div class="cv-change-device-orientation"></div>')

    $popHead.append($btnGroup);
    $popHead.append($changeOrientation);
    $popHead.append($lst);

    wrapper.$baseTemplate.append($popHead);

    var $messageSection = $(
        '<div id="cvMessagesWrapper" class="cv-messages-wrapper ' + (this.showToolbar ? "with-toolbar" : "") + '"></div>')
        .append($('<div id="cvMessages" class="cv-messages"></div>'));

    wrapper.$baseTemplate.append($messageSection);

    var $footer = $(
        '<div id="cvChatFooter" class="cv-footer"></div>')
        .append($('<div id="cvAgentTyping" class="cv-footer__agent"><span></span><span></span><span></span></div>'));

    var $sendField = $(
        '<textarea id="cvMessageTextarea" name="message"' +
        'placeholder="' + wrapper.placeholder + '" class="cv-textarea ' + (wrapper.hideSendButton ? "no-button" : "with-button") + '"></textarea>'
    );

    var $sendButton = $(
        '<button type="button" id="cvSendMessage" data-widget="send" class="cv-btn cv-btn--send">' +
        '<span class="sr-only">' + wrapper.sendButtonTitle + '</span>' +
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" xml:space="preserve" viewBox="0 0 24 24" style="position: relative; top: 0; left: 0; width: 34px; outline: none;">' +
        '<g id="info"></g>' +
        '<g id="icons">' +
        '<path d="M21.5,11.1l-17.9-9C2.7,1.7,1.7,2.5,2.1,3.4l2.5,6.7L16,12L4.6,13.9l-2.5,6.7c-0.3,0.9,0.6,1.7,1.5,1.2l17.9-9 C22.2,12.5,22.2,11.5,21.5,11.1z" id="send"></path>' +
        '</g></svg>' +
        '</button>'
    );

    var $messageBox = $(
        '<div class="cv-message-container"></div>')
        .append($sendField);

    if (!wrapper.hideSendButton) {
        $messageBox.append($sendButton);
    }

    $footer.append($messageBox);

    if (this.showToolbar) {

        var $toolbar = $('<div id="cvFileUploader" class="cv-uploader"></div>');

        if (this.showBrowseButton) {
            $toolbar.append(
                '<label for="cvFileUpload" class="cv-uploader__label">' +
                '<i aria-hidden="true" class="cv-icon fas fa-paperclip"></i>' +
                '</label>' +
                '<input type="file" id="cvFileUpload" name="fileToUpload" class="cv-uploader__input sr-only" multiple>');

            $toolbar.append('<div id="cvFileName" aria-live="polite" class="cv-uploader__filename"></div>');
        }
        $footer.append($toolbar);
    }

    wrapper.$baseTemplate.append($footer);
};

ConverseWebClient.prototype._enableChatWindow = function () {
    if (!this.hideSendButton) {
        $(this.baseContainer).find("#cvSendMessage").prop("disabled", false);
    }
    // Header
    $(this.baseContainer).find("#cvConnectionStatus").removeAttr("title");
    $(this.baseContainer).find("#cvConnectedIcon").removeClass("cv--is-disconnected");
    $(this.baseContainer).find("#cvConnectedIcon").addClass("cv--is-connected");
    $(this.baseContainer).find("#cvConnectionMsg").text(this.connectedText);
    // Card buttons
    $(this.baseContainer).find(".pb-btn").prop("disabled", false);
    $(this.baseContainer).find(".cv-btn--message").prop("disabled", false);
    // Input section
    $(this.baseContainer).find("#cvMessageTextarea").prop("disabled", false);
    $(this.baseContainer).find("#cvSendMessage").prop("disabled", false);
    $(this.baseContainer).find(".cv-uploader__label").removeClass("cv-uploader--is-disabled");
    $(this.baseContainer).find("#cvFileUpload").prop("disabled", false);
};

ConverseWebClient.prototype._disableChatWindow = function () {
    // Header
    $(this.baseContainer).find("#cvConnectionStatus").attr("title", this.disconnectedText);
    $(this.baseContainer).find("#cvConnectedIcon").removeClass("cv--is-connected");
    $(this.baseContainer).find("#cvConnectedIcon").addClass("cv--is-disconnected");
    $(this.baseContainer).find("#cvConnectionMsg").text(this.disconnectedText);
    // Card buttons
    $(this.baseContainer).find(".pb-btn").prop("disabled", true);
    $(this.baseContainer).find(".cv-btn--message").prop("disabled", true);
    // Input section
    $(this.baseContainer).find("#cvMessageTextarea").prop("disabled", true);
    $(this.baseContainer).find("#cvSendMessage").prop("disabled", true);
    $(this.baseContainer).find(".cv-uploader__label").addClass("cv-uploader--is-disabled");
    $(this.baseContainer).find("#cvFileUpload").prop("disabled", true);
};

ConverseWebClient.prototype.onConnect = function () {
    var client = this;

    if (client.history.length === 0 && !client.tryReconnect && client.startPhrase) {
        client.sendPostBackSilent(client.startPhrase);
    }

    client.tryReconnect = false;
    client._enableChatWindow();

    if (client.retryIntrval) {
        clearInterval(client.retryIntrval);
    }
};

ConverseWebClient.prototype.onReconnect = function () {
    if (this.socket.readyState === WebSocket.CLOSED) {
        this.tryReconnect = true;
        this.initSocket();
    }
};

ConverseWebClient.prototype.onAttachment = function (message) {
    message.data.direction = message.data.direction === "inbound" ? "outbound" : "inbound";
    this.addDownloadMessage(message.data);
    if (this.receiveCallback) {
        this.receiveCallback(message);
    }
};

ConverseWebClient.prototype.onAttachedText = function (message) {
    message.direction = message.direction === "outbound" ? "inbound" : "outbound";
    if (message.hasOwnProperty("originalName")) {
        return this.addDownloadMessage(message);
    }
    this.addChatMessage({
        direction: message.direction,
        message: message.data.originalName
    });
};

ConverseWebClient.prototype.onAttachedErrorText = function (message) {
    this.addChatMessage({
        direction: "error",
        message: (this.downloadErrorText || message.msg).replace("${name}", message.name)
    });
};

ConverseWebClient.prototype.onText = function (message) {
    this.text(message.message);
    if (this.receiveCallback) {
        this.receiveCallback(message);
    }
};

ConverseWebClient.prototype.onButtons = function (data) {
    this.addButtonMessage(data.data);
    if (data.disableTextInput) {
        this.disableTextArea();
    }
    if (this.receiveCallback) {
        this.receiveCallback(data);
    }
};

ConverseWebClient.prototype.onCard = function (data) {
    this.addCardMessage(data.data);
    if (this.receiveCallback) {
        this.receiveCallback(data);
    }
};

ConverseWebClient.prototype.onCardButton = function (messageEvent) {
    var data = [messageEvent.data];
    this.addCardMessage(data);
    if (data.disableTextInput) {
        this.disableTextArea();
    }
    if (this.receiveCallback) {
        this.receiveCallback(data);
    }
};

ConverseWebClient.prototype.clearChat = function () {
    $(this.baseContainer).find("#cvMessages").empty();
    $(this.baseContainer).find("#cvSettingsDropdown").toggleClass("show");
    this.lastTimestamp = 0;
    this.lastDirection = null;
    this.sendPostBackSilent("#silentcancel#");
};

ConverseWebClient.prototype.onQuickReply = function (messageEvent) {
    var data = messageEvent.data;

    this.addQuickReplyMessage(data);
    if (messageEvent.disableTextInput) {
        this.disableTextArea();
    }
    if (this.receiveCallback) {
        this.receiveCallback(data);
    }
};

ConverseWebClient.prototype.onDisconnect = function () {
    var client = this;
    client.socket.close();
    client._disableChatWindow();

    client.retryIntrval = setInterval(function () {
        client.onReconnect();
    }, client.reConnectDelay);
};

ConverseWebClient.prototype.cleanInput = function (input) {
    return $("<div/>").text(input).text();
};

ConverseWebClient.prototype.openBot = function (tenant, bot, user) {
    let client = this;
    client._disableChatWindow();
    if (!client.socket) {
        throw "Socket is not connected. Did you remember to call ConverseWebChat.init?";
    }

    client.tenant = client.tenant || tenant;
    client.botId = client.botId || bot;
    client.user = client.user || user || {};

    client.openCount++;
    if (client.openCount < client.openRetries) {
        client.openBotTimer = setTimeout(function () {
            client.openBot(tenant, bot, user);
        }, 2000);

        this.socket.emit("openBot", { tenantId: tenant, botid: bot, user: user });
    }
};

ConverseWebClient.prototype.text = function (message) {
    this.addChatMessage({
        direction: "inbound",
        message: message.text.type === "card" ? message.text.text : message.text
    });
};

ConverseWebClient.prototype.onTypeOn = function () {
    $(this.baseContainer).find("#cvAgentTyping").addClass("cv-agent--is-typing");
};

ConverseWebClient.prototype.onTypeOff = function () {
    $(this.baseContainer).find("#cvAgentTyping").removeClass("cv-agent--is-typing");
};

ConverseWebClient.prototype.onAccountLinkRedirect = function (packet) {
    this.windowOpen.call(window, packet, "_blank");
};

ConverseWebClient.prototype.messageSend = function () {
    var msg = this.cleanInput($(this.baseContainer).find("#cvMessageTextarea").val());
    var files = [];
    var fileTimeoutValue = 0;
    if ($(this.baseContainer).find("#cvFileUpload").length > 0) {
        files = $(this.baseContainer).find("#cvFileUpload")[0].files;
    }

    if (msg) {
        this.cvSendMessage(msg);
        $(this.baseContainer).find("#cvMessageTextarea").val("");
        fileTimeoutValue = 1000;
    }

    if (files && files.length) {
        var _this = this;
        setTimeout(function () {
            _this.sendFiles(files);
            $(_this.baseContainer).find("#cvFileUpload").val("");
            $(_this.baseContainer).find("#cvFileName").text("");
        }, fileTimeoutValue);
    }
};

ConverseWebClient.prototype.userIsTyping = function () {
    if (!this.isTyping) {
        this._callSend({}, "typing_on")
    }
    this.isTyping = true;
};

ConverseWebClient.prototype.userStopTyping = function () {
    if (this.isTyping) {
        this._callSend({}, "typing_off")
    }
    if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
    }
    this.isTyping = false;
};

ConverseWebClient.prototype.renderMain = function (callback, history) {
    var wrapper = this;

    $(wrapper.baseContainer).append(wrapper.$baseTemplate);

    $(wrapper.baseContainer).find("#cvMinimizeChat").click(function (event) {
        event.preventDefault();
        event.stopPropagation();

        wrapper.minimize();

        return false;
    });

    $(wrapper.baseContainer).find("#cvMaximizeChat").click(function (event) {
        event.preventDefault();
        event.stopPropagation();

        wrapper.maximize();
        $(wrapper.baseContainer).find("#cvMessageTextarea").focus();

        return false;
    });

    $(wrapper.baseContainer).find("#cvCloseChat").click(function (event) {
        event.preventDefault();
        event.stopPropagation();

        $("#cvChatContainer")
        .removeClass("cv--is-open")
        .addClass("cv--is-hidden cv--is-closed")
        .attr("aria-expanded", false)
        $("#cvMessages").empty();

        return false;
    });

    $(wrapper.baseContainer).find("#cvMessageTextarea").keydown(function (event) {
        if (event.which === 13) {
            wrapper.messageSend();
            event.preventDefault();
        }
        if (event.which === 8 || event.which === 32 ||
            (event.which > 44 && event.which < 112) || event.which > 123) { // alt, ctrl, esc, F1, F2, ...
            wrapper.userIsTyping();
        }
    });

    $(wrapper.baseContainer).find("#cvMessageTextarea").keyup(function (event) {
        if (wrapper.typingTimeout) {
            clearTimeout(wrapper.typingTimeout);
        }
        wrapper.typingTimeout = setTimeout(function () {
            wrapper.userStopTyping();
        }, wrapper.isTypingDelay);
    });

    $(wrapper.baseContainer).find("#cvSendMessage").click(function () {
        wrapper.messageSend();
    });

    if (typeof callback === "function") {
        callback();
    }

    $(wrapper.baseContainer).find("#cvSettingsDropdownBtn").click(function () {
        $(wrapper.baseContainer).find("#cvSettingsDropdown").toggleClass("show");

        $(wrapper.baseContainer).find("#cvSettingsDropdown").attr("aria-expanded", function (i, attr) {
            return attr == 'true' ? 'false' : 'true'
        });
    });

    $(wrapper.baseContainer).find("#cvSettingsDropdownBtn").onclick = function (event) {
        if (event.target &&
            event.target.offsetParent &&
            event.target.id !== "cvSettingsDropdownBtn" &&
            event.target.offsetParent.id !== "cvSettingsDropdownBtn") {

            var dropdowns = $(wrapper.baseContainer).find("#cvSettingsDropdown");
            var i;
            for (i = 0; i < dropdowns.length; i++) {
                var openDropdown = dropdowns[i];
                if (openDropdown.classList.contains("show")) {
                    openDropdown.classList.remove("show");
                }
            }
        }
    };

    $(wrapper.baseContainer).find("#cvChatHeader").click(function onClickHeader(event) {
        if ($(wrapper.baseContainer).hasClass("cv--is-closed")) {
            event.preventDefault();
            event.stopPropagation();

            $(wrapper.baseContainer).removeClass("cv--is-closed");
            $(wrapper.baseContainer).addClass("cv--is-open");

            return false;
        }
    });

    if (this.showToolbar) {
        $(wrapper.baseContainer).find("#cvFileUpload").change(function () {
            var files = $(wrapper.baseContainer).find("#cvFileUpload")[0].files;
            var fileArray = [];
            var fileString = "";

            Object.keys(files).forEach(function (key) {
                fileArray.push($(wrapper.baseContainer).find("#cvFileUpload")[0].files[key].name);
            });
            if (fileArray.length > 0) {
                fileString = fileArray.join(", ");
            }

            $(wrapper.baseContainer).find("#cvFileName").text(fileString);
        });

        $(wrapper.baseContainer).find("#cvFileUpload").on("click", function () {
            $(wrapper.baseContainer).find("#cvFileUpload").val("");
            $(wrapper.baseContainer).find("#cvFileName").text("");
        });
    }

    let events = [
        "text",
        "postback",
        "buttons",
        "card",
        "buttonCard",
        "quick_replies",
        "account_link_redirect",
        "disconnect",
        "attachment",
        "attached-text",
        "attached-error",
        "connect",
    ];

    if (history.length) {
        for (let message of history) {
            if (!events.includes(message.data.type)) {
                continue;
            }
            switch (message.data.type) {
                case "text":
                    wrapper.addChatMessage({
                        direction: message.direction,
                        message: message.data.message.text.type === "card" ? message.data.message.text.text : message.data.message.text
                    });
                    break;
                case "postback":
                    wrapper.addChatMessage({
                        direction: message.direction,
                        message: message.data.message.title || message.data.message.text
                    });
                    break;
                case "buttons":
                    wrapper.addButtonMessage({
                        direction: message.direction,
                        text: message.data.data.text,
                        buttons: message.data.data.buttons
                    });
                    break;
                case "card":
                    wrapper.addCardMessage(message.data.data);
                    break;
                case "buttonCard":
                    wrapper.onCardButton({
                        direction: message.direction,
                        data: message.data.data
                    });
                    break;
                case "quick_replies":
                    wrapper.addQuickReplyMessage({
                        direction: message.direction,
                        text: message.data.data.text,
                        quick_replies: message.data.data.quick_replies
                    });
                    break;
                case "attachment":
                    wrapper.onAttachment({
                        direction: message.direction === "inbound" ? "outbound" : "inbound",
                        data: message.data.data
                    });
                    break;
                case "attached-text":
                    wrapper.onAttachedText({
                        direction: message.direction,
                        data: message.data.data
                    });
                    break;
                default:
                    break;
            }
        }
    }
};

ConverseWebClient.prototype.sendPostBack = function (payload, title, message) {
    if (payload || title || message) {
        this.sendPostBackSilent(payload, title, message);
        this.addChatMessage({
            direction: "outbound",
            message: title
        });
    }
};

ConverseWebClient.prototype.sendPostBackSilent = function (payload, title, message) {
    var self = this;

    if (!payload && !title) {
        return;
    }

    var msg = {
        text: payload || title,
        title: title,
        incomingMessage: message
    };

    self._callSend(msg, "postback");

    if (self.sendCallback) {
        self.sendCallback(msg.text);
    }
};

ConverseWebClient.prototype.cvSendMessage = function (text) {
    if (!text) {
        this.userStopTyping();
        return;
    }

    let msg = {
        text: text
    };

    if (this.sendCallback && (!this.sendCallback(text))) {
        this.userStopTyping();
        return;
    }

    this._callSend(msg, "text");

    this.addChatMessage({
        direction: "outbound",
        message: text
    });

    this.userStopTyping();
};

ConverseWebClient.prototype.sendFiles = function (files) {
    var self = this;
    var outboundFiles = [];

    if (files) {
        var fileObject = $(this.baseContainer).find("#cvFileUpload");

        Object.keys(files).forEach(function (key) {
            var p = new Promise(function (resolve, reject) {
                var file = fileObject[0].files[key];
                var fileReader = new FileReader();

                fileReader.readAsBinaryString(file);

                fileReader.onload = function (e) {
                    resolve({
                        file: e.currentTarget.result,
                        name: file.name,
                        size: file.size,
                        type: file.type
                    });
                };

                fileReader.onerror = function (e) {
                    reject(e)
                };
            });

            outboundFiles.push(p);
        });

        Promise.all(outboundFiles).then(function (r) {
            self._callSend(outboundFiles, "attachments");
        });
    }
};

ConverseWebClient.prototype._callSend = function (msg, type) {
    let payload = JSON.stringify({
        type: type,
        timestamp: Date.now(),
        message: msg,
        sender: this.user,
        recipient: {
            "bot": this.botId,
            "tenant": this.tenant
        }
    });

    this.socket.send(payload, { binary: type === "attachments" });
};

ConverseWebClient.prototype.show = function () {
    if (this.startMinimized) {
        $(this.baseContainer).addClass("cv--is-hidden cv--is-closed").attr("aria-expanded", false);
    }
};

ConverseWebClient.prototype.hide = function () {
    if (this.hideCallback) {
        this.hideCallback();
    }
};

ConverseWebClient.prototype.minimize = function () {
    $(this.baseContainer).removeClass("cv--is-open");
    $(this.baseContainer).addClass("cv--is-closed");
    $(this.baseContainer).attr("aria-expanded", function (i, attr) {
        return attr == 'true' ? 'false' : 'true'
    });
    if (this.hideCallback) {
        this.hideCallback();
    }

};

ConverseWebClient.prototype.maximize = function () {
    $(this.baseContainer).removeClass("cv--is-closed");
    $(this.baseContainer).addClass("cv--is-open");
    $(this.baseContainer).attr("aria-expanded", function (i, attr) {
        return attr == 'true' ? 'false' : 'true'
    });
    $('#cvMessageTextarea').focus();
};

ConverseWebClient.prototype.setWrapperItems = function (data) {
    var reset = false;
    if (this.lastTimestamp < ((new Date()).getTime() - (this.REDATE_TIME * (1000 * 60)))) {
        this.lastTimestamp = (new Date()).getTime();
        rest = true;

        $(this.baseContainer).find("#cvMessages").append($(
            '<div class="cv-messages__timestamp">' +
            '<time>' + this.getTimeStamp() + '</time>' +
            '</div>')
        );
    }

    if (!this.lastContainer || this.lastDirection !== data.direction || reset) {
        var $msgWrapper = $(
            '<div class="cv-message cv-message--' + data.direction + '">' +
            '</div>'
        );
        var $items = $(
            '<div class="cv-' + data.direction + '__inner"></div>'
        );

        if (data.direction === "inbound") {
            $msgWrapper.append($(
                '<img alt="" src="' + this.serverUserImage + '" class="cv-message__direct-chat-img">'
            ));
        }

        $msgWrapper.append($items);

        if (data.direction === "outbound" && !!this.clientUserImage) {
            $msgWrapper.append($(
                '<img alt="" src="' + this.clientUserImage + '" class="cv-message__direct-chat-img">'
            ));
        }
        $(this.baseContainer).find("#cvMessages").append($msgWrapper);
        this.lastContainer = $msgWrapper;
        this.lastContainerItems = $items;
        this.lastDirection = data.direction;
    }
};

ConverseWebClient.prototype.buttonClick = function (e, button) {
    var $button = $(e.target);
    var ts = $button.parents("div[data-timestamp]").data("timestamp");
    var message = this.incomingMessages[ts];
    var url = "";
    var urlParams = new UrlParameters(this.converseHost + "/proxy/redirect");

    urlParams.setParameter("target", button.url);
    urlParams.setParameter("button", button.title);
    urlParams.setParameter("sessionid", this.user.chatid);
    if (message && message.hasOwnProperty("text")) {
        urlParams.setParameter("message", message.text);
    }

    switch (button.type) {
        case "account_unlink":
            this._callSend({}, "account_unlink");
            break;
        case "account_link":
            this.windowOpen.call(window, button.url, "account_link");
            break;
        case "web_url":
            this.windowOpen.call(window, urlParams.getUrl(), "_blank");
            break;
        case "phone_number":
            urlParams.setParameter("target", "tel:+" + button.payload);
            this.windowOpen.call(window, urlParams.getUrl(), "_self");
            break;
        case "postback":
        default:
            this.sendPostBack(button.payload, $("<div>" + button.title + "</div>").text(), message);
            break;
    }

    this.enableTextArea();
};

ConverseWebClient.prototype.addQuickReplyMessage = function (data) {
    data.direction = "inbound";
    var me = this;
    me.setWrapperItems(data);

    var $buttonContainer = $(
        '<div class="cv-message-text__inbound"></div>'
    );


    if (this.allowHTML) {
        $buttonContainer.text(data.text);
    } else {
        $buttonContainer.html(data.text);
    }

    var $messageButtons = $(
        '<div class="cv-quick-reply-container"></div>'
    );

    $.each(data.quick_replies, function (index, button) {
        var $button = $("<span />", {
            "class": "pb-chat-badge-brand-info cv-quick-reply"
        });

        if (this.allowHTML) {
            $button.html(button.title);
        } else {
            $button.html(button.title);
        }

        $button.on("click", function (e) {
            me.buttonClick(e, button);
            $messageButtons.hide();
        });

        if (button.image_url) {
            $button.append(
                '<img src="' + button.image_url + '" class="cv-quick-reply__img">'
            );
        }
        $messageButtons.append($button);
    });

    $buttonContainer.append($messageButtons);
    me.addMessageElement($buttonContainer, data);
};

ConverseWebClient.prototype.addCardMessage = function (data, options) {
    var me = this;
    data.direction = "inbound";
    me.setWrapperItems(data);
    var timestamp = new Date(),
        cardContainerId = "cvCardContainer" + timestamp.getHours() + "" + timestamp.getMinutes() + "" + timestamp.getSeconds() + "" + timestamp.getMilliseconds();

    var cardsWrapper = $("<div />", { "class": "cv-cards-wrapper" }),
        cardContainer = $("<div />", { "class": "cv-card-container", id: cardContainerId });

    $.each(data, function (index, card) {
        var cardEl = $('<div class="cv-card"></div>');

        if (card.image_url) {
            if (card.image_url.indexOf("www.youtube.com/embed") > -1) {
                cardEl.append(
                    '<iframe class="cv-card-iframe" frameborder="0" target="_parent" src="' + card.image_url + '"></iframe>'
                );
            } else {
                cardEl.append($(
                    '<img src="' + card.image_url +'" alt="" class="cv-message__image">'
                ));
            }
        }
        if (this.allowHTML) {
            cardEl.append($("<div />", { "class": "cv-card__title", html: card.title }));
        } else {
            cardEl.append($("<div />", { "class": "cv-card__title", text: card.title }));
        }

        if (card.subtitle) {
            if (this.allowHTML) {
                cardEl.append($("<div />", { "class": "cv-card__subtitle", html: card.subtitle }));
            } else {
                cardEl.append($("<div />", { "class": "cv-card__subtitle", text: card.subtitle }));
            }
        }

        if (card.item_url) {
            cardEl.append($("<a>", { "class": "cv-card__url", text: card.item_url, href: card.item_url, target: "_blank" }));
        }

        var $buttonContainer = $('<div class="cv-message__button-group"></div>');

        $.each(card.buttons, function (index, button) {
            var $button = $(
                '<button type="button" class="cv-btn cv-btn--message">' + button.title + '</button>'
            );

            $button.on("click", function (e) {
                me.buttonClick(e, button);
            });

            $buttonContainer.append($button);
        });

        cardEl.append($buttonContainer);
        cardContainer.append(cardEl);
    });

    cardsWrapper.append(cardContainer);

    if (data.length > 1) {
        cardsWrapper.append(
            '<div class="card-nav-btns-custom">' +
            '<div class="card-nav-item">' +
            '<button type="button" class="slick-prev-custom"></button>' +
            '</div>' +
            '<div class="dots-custom card-nav-item"></div>' +
            '<div class="card-nav-item">' +
            '<button type="button" class="slick-next-custom"></button>' +
            '</div>' +
            '</div>'
        );
    }

    this.addMessageElement(cardsWrapper, data);

    cardContainer.slick({
        variableWidth: false,
        prevArrow: cardsWrapper.find(".slick-prev-custom"),
        nextArrow: cardsWrapper.find(".slick-next-custom"),
        dots: false,
        appendDots: cardsWrapper.find(".card-nav-btns-custom .dots-custom")
    });
};

ConverseWebClient.prototype.addButtonMessage = function (data, options) {
    var me = this;
    var ts = Date.now();
    this.incomingMessages[ts] = data;
    data.__id = ts;
    data.direction = "inbound";
    this.setWrapperItems(data);
    var $buttonContainer = $(
        '<div data-timestamp="' + ts + '" class="cv-message-text__inbound"></div>'
    );
    var $messageText = $('<div></div>');

    if (this.allowHTML) {
        $messageText.html(data.text);
    } else {
        $messageText.text(data.text);
    }

    var $messageButtons = $(
        '<div class="cv-message__button-group"></div>'
    );

    $.each(data.buttons, function (index, button) {
        var $button = $(
            '<button type="button" class="cv-btn cv-btn--message">' + button.title + '</button>'
        );

        $button.click(function (e) { me.buttonClick(e, button); });
        $messageButtons.append($button);
    });
    $buttonContainer.append($messageText, $messageButtons);
    this.addMessageElement($buttonContainer, data);
};

ConverseWebClient.prototype.addDownloadMessage = function (data, options) {
    this.setWrapperItems(data);

    var $messageBodyDiv = $(
        '<div class="cv-message-text__' + data.direction + '">'
    );

    if (data.type.indexOf("image") === -1) {
        $messageBodyDiv.append($(
            '<div class="cv-message__download-name">' + data.originalName + '</div>' +
            '<a target="_new" class="cv-message__download-link" href="' + this.converseHost + '/' + data.link + '" alt="' + this.downloadText + '">' +
            '<span class="fas fa-file-download"></span>' +
            '</a>'
        ));
    } else {
        $messageBodyDiv.append($(
            '<img class="cv-message__image" src="' + this.converseHost + '/' + data.link + '" alt="' + data.originalName + '"></img>'
        ));
    }

    this.addMessageElement($messageBodyDiv, data);
};

ConverseWebClient.prototype.addChatMessage = function (data, options) {
    this.setWrapperItems(data);

    var ts = Date.now();

    data.__id = ts;
    this.incomingMessages[ts] = data;

    var $messageBodyDiv;
    if (data.message.trim().substring(0, 29) === "https://www.youtube.com/embed" && data.direction === "inbound") {
        var frame = $("<iframe>", {
            width: "100%",
            src: data.message,
            frameborder: 0,
            allow: "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture",
            allowfullscreen: true
        });
        $messageBodyDiv = $('<div class="cv-message-text__' + data.direction + '">');
        $messageBodyDiv.append(frame);
    } else if (ConverseUtil.isValidUrl(data.message.trim())) {
        var a = $("<a>", {
            href: data.message.trim(),
            class: "pb-rich-link-link",
            target: "_blank"
        });

        var imageContainer = $("<div>", {
            class: "pb-rich-link-image",
            css: {
                "display": "none"
            }
        });

        var title = $("<div>", {
            class: "pb-rich-link-title",
            text: data.message
        });

        var description = $("<div>", {
            class: "pb-rich-link-description"
        });

        a.append(imageContainer)
            .append(title)
            .append(description);

        $messageBodyDiv = $('<div class="cv-message-text__' + data.direction + '">');

        $messageBodyDiv.append(a);
    } else if (data.message.indexOf("data:image/") === 0) {
        $messageBodyDiv = $('<img class="cv-message-text__' + data.direction + '">')
            .src(data.message);
    } else if (this.allowHTML) {
        $messageBodyDiv = $('<div class="cv-message-text__' + data.direction + '">')
            .html(data.message);
    } else {
        $messageBodyDiv = $('<div class="cv-message-text__' + data.direction + '">')
            .text(data.message);
    }
    this.addMessageElement($messageBodyDiv, data);
};

ConverseWebClient.prototype.addMessageElement = function (el, data) {
    var $el = $(el);
    var me = this;
    $el.attr("data-timestamp", data.__id);
    $el.hide().fadeIn(this.FADE_TIME);
    this.lastContainerItems.append($el);

    $(me.baseContainer).find("#cvMessagesWrapper").animate({
        scrollTop: $(me.baseContainer).find("#cvMessagesWrapper").get(0).scrollHeight
    }, 100);

    this.onTypeOff();
};

ConverseWebClient.prototype.getTimeStamp = function () {
    var today = new Date();
    return today.toLocaleDateString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }) + " " +
        today.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit"
        });
};

ConverseWebClient.prototype.disableTextArea = function () {
    $(this.baseContainer).find("textarea")
        .attr('placeholder', this.disabledPlaceholder)
        .prop('disabled', true);
};

ConverseWebClient.prototype.enableTextArea = function () {
    $(this.baseContainer).find("textarea")
        .attr('placeholder', this.placeholder)
        .prop('disabled', false);
};
