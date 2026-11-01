include $(ROOTDIR)/rules.mk

PKG_NAME:=ebtables
PKG_VERSION:=2.0.11

PKG_SOURCE:=ebtables-2.0.11.tar.gz
PKG_SOURCE_URL:=https://www.netfilter.org/pub/ebtables
PKG_HASH:=b71f654784a726329f88b412ef7b96b4e5d786ed2bd28193ed7b4c0d677dfd2a

include $(INCLUDE_DIR)/package.mk

SRC_DIR:=./src

CONFIGURE_ARGS += --enable-static --disable-shared

# 扩展依靠构造函数注册，必须整库链接；同一个 -Wl 参数避免 Libtool 重排边界。
MAKE_FLAGS += \
	ebtables-legacy -W ebtables-standalone.o \
	ebtables_legacy_LDADD="-Wl,--whole-archive,.libs/libebtc.a,--no-whole-archive" \
	KERNEL_INCLUDES=$(KERNEL_HEADERS_PATH)

$(eval $(call BuildPackage,ebtables))

# 配方改变时重做链接，避免增量构建继续打包旧的损坏程序。
$(STAMP_BUILT): Makefile

romfs:
	$(INSTALL_DIR) $(ROMFSDIR)/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/ebtables-legacy $(ROMFSDIR)/bin/ebtables
	$(INSTALL_DIR) $(ROMFSDIR)/etc_ro
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/ethertypes $(ROMFSDIR)/etc_ro/ethertypes
