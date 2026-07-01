---
title: "Linux 是如何理解 SoC 里的 I2C 控制器的"
date: 2026-07-1T23:00:00+08:00
draft: false
tags: []
categories: ["tech"]
summary: ""
cover: ""
comments: true
---

# Linux 是如何理解 SoC 里的 I2C 控制器的

最近在研究 *Sispeed* 的 *Licheerv Nano* 中 *GC4653* 相机超频CLK到37.125MHz-80fps时，遇到了不少问题，比如VB Pool段错误/VPSS JOB异常归零，于是决定刨根问底，想从底层研究整个初始化以及取帧流程。便开始理解 Linux 设备树、I2C 控制器、`/dev/i2c-X` 和内核驱动之间的关系。这个问题一开始看起来很绕，但如果分层看，其实逻辑非常清晰。

## 📚 目录

1. [I2C 控制器和 I2C 外设不是一回事](#1-i2c-控制器和-i2c-外设不是一回事)
2. [Linux 怎么知道 SoC 里有哪些控制器？](#2-linux-怎么知道-soc-里有哪些控制器)
3. [有 DTS 还不够，还必须有匹配的驱动](#3-有-dts-还不够还必须有匹配的驱动)
4. [如果没有匹配驱动会怎么样？](#4-如果没有匹配驱动会怎么样)
5. [什么是 i2c_adapter？](#5-什么是-i2c_adapter)
6. [为什么需要 i2c_adapter？](#6-为什么需要-i2c_adapter)
7. [I2C 控制器驱动要提供什么统一接口？](#7-i2c-控制器驱动要提供什么统一接口)
8. [`/dev` 下面的东西是什么？](#8-dev-下面的东西是什么)
9. [总结](#9-总结)

## 1. I2C 控制器和 I2C 外设不是一回事

首先要区分两个概念：

```text
I2C 控制器：通常在 SoC 内部
I2C 外设：通常在 SoC 外部的 PCB 板子上
```

比如一颗 SoC 里面可能集成了多个 I2C 控制器：

```text
SoC 内部
├── CPU
├── GPIO 控制器
├── UART 控制器
├── SPI 控制器
└── I2C 控制器 0/1/2/3/4
```

这些 I2C 控制器本质上是一组 MMIO 寄存器和硬件状态机，负责产生 SCL 时钟、控制 SDA 数据线、处理 ACK/NACK、中断、传输状态等。

而 I2C 外设一般是挂在 PCB 上的独立芯片，例如：

```text
SoC 内部 I2C4 控制器
        │
        │ SCL / SDA
        ↓
     PCB 走线
        ↓
外部 I2C 设备
├── 摄像头 sensor，addr = 0x29
├── EEPROM，addr = 0x50
├── IMU，addr = 0x68
├── PMIC，addr = 0x34
└── OLED，addr = 0x3c
```

所以两者最关键的区别是：

> I2C 控制器是 SoC 里的主机端硬件，I2C 外设是挂在 SCL/SDA 总线上的从设备芯片。

---

## 2. Linux 怎么知道 SoC 里有哪些控制器？

对于很多 ARM/RISC-V SoC 来说（比如说我用的Sophgo2002就是RISC-V架构的），I2C、SPI、UART、GPIO 这类控制器通常不能像 PCI 设备一样自动枚举。

Linux 不会凭空知道：

```text
这个 SoC 里有几个 I2C 控制器
每个控制器的寄存器物理地址在哪里
它们使用哪个中断号
它们接了哪个时钟
哪些引脚被复用成 SCL/SDA
```

这些信息通常由设备树 DTS/DTB 提供。

一个 I2C 控制器节点大概长这样：

```dts
i2c4: i2c@04040000 {
    compatible = "vendor,soc-i2c";
    reg = <0x04040000 0x1000>;
    interrupts = <42>;
    clocks = <&clk 12>;
    resets = <&rst 8>;
    status = "okay";
};
```

其中：

```dts
compatible = "vendor,soc-i2c";
```

表示这个控制器应该匹配哪类驱动。

```dts
reg = <0x04040000 0x1000>;
```

表示这个控制器的寄存器物理地址从 `0x04040000` 开始，大小是 `0x1000`。

```dts
status = "okay";
```

表示这个设备启用。

所以 DTS 的作用不是驱动硬件，而是描述硬件：

> 这里有一个 I2C 控制器，它的寄存器在这个物理地址，它应该用这种类型的驱动来接管。

---

## 3. 有 DTS 还不够，还必须有匹配的驱动

设备树只是告诉 Linux：

```text
这里有一个硬件
```

但是 Linux 还需要有对应的驱动，才能真正操作这个硬件。

内核启动后，DTS 里的 I2C 控制器节点会被转换成一个 `platform_device`。然后 Linux 会根据 `compatible` 字段去找匹配的 `platform_driver`。

如果驱动里有类似这样的匹配表：

```c
static const struct of_device_id vendor_i2c_match[] = {
    { .compatible = "vendor,soc-i2c" },
    { }
};
```

并且 DTS 里也写了：

```dts
compatible = "vendor,soc-i2c";
```

那么 platform bus 就会把 device 和 driver 匹配起来，然后调用驱动的 `probe()` 函数。

可以理解为：

```text
DTS 描述 i2c@04040000
        ↓
Linux 创建 platform_device
        ↓
I2C 控制器驱动注册 platform_driver
        ↓
compatible 匹配成功
        ↓
调用 probe()
        ↓
驱动接管这个硬件控制器
```

这里还有一个关键点：device 和 driver 没有固定的先后顺序。

可能是设备先出现，驱动后加载；也可能是驱动先注册，设备后出现。只要两边都存在，Linux 的设备模型就会尝试匹配。

---

## 4. 如果没有匹配驱动会怎么样？

如果 DTS 里写了这个控制器：

```dts
i2c4: i2c@04040000 {
    compatible = "vendor,soc-i2c";
    reg = <0x04040000 0x1000>;
    status = "okay";
};
```

但是内核里没有任何驱动支持：

```text
vendor,soc-i2c
```

那么结果通常是：

```text
platform_device 可能存在
但是不会 probe
控制器不会初始化
不会注册 i2c_adapter
不会出现 /dev/i2c-4
```

也就是说：

```text
DTS 里有设备
    只能说明 Linux 知道“有这个硬件描述”

有匹配驱动
    才能真正接管硬件

驱动 probe 成功
    才能把硬件注册进对应的 Linux 子系统
```

所以 `/dev/i2c-4` 不是 DTS 直接生成的。

它依赖于：

```text
DTS 有 I2C 控制器节点
        ↓
有匹配的 I2C 控制器驱动
        ↓
驱动 probe 成功
        ↓
注册 i2c_adapter
        ↓
i2c-dev 暴露用户态接口
        ↓
生成 /dev/i2c-4
```

---

---

## 5. 什么是 i2c_adapter？

`i2c_adapter` 是 Linux I2C 子系统中的一个核心抽象。

它表示：

> Linux 内核里的一条 I2C 总线，或者说一个已经被驱动接管的 I2C 控制器。

比如 SoC 里有一个 I2C4 控制器：

```text
SoC 内部 I2C4 控制器
        ↓
I2C 控制器驱动 probe 成功
        ↓
注册 struct i2c_adapter
        ↓
Linux 看到 i2c-4 这条总线
```

所以 `i2c_adapter` 不是某个外设，也不是 `/dev/i2c-4` 本身。

它更像是内核中对这条 I2C 总线的代表。

一条 I2C 总线上可以挂多个 I2C 外设：

```text
i2c_adapter: i2c-4
├── i2c_client: 4-0029  摄像头 sensor
├── i2c_client: 4-0050  EEPROM
├── i2c_client: 4-0068  IMU
└── i2c_client: 4-003c  OLED
```

这里：

```text
i2c_adapter = 总线 / 控制器
i2c_client  = 挂在总线上的某个 I2C 外设
```

---

## 6. 为什么需要 i2c_adapter？

因为不同 SoC 的 I2C 控制器硬件不一样。

例如：

```text
SG2002 I2C 控制器
RK3588 I2C 控制器
STM32 I2C 控制器
Zynq I2C 控制器
```

它们的寄存器布局、FIFO、中断、状态位、时钟配置方式可能都不一样。

Linux 不可能让每个上层 I2C 外设驱动都去关心这些差异。

所以 Linux 的设计是：

```text
不同 SoC 的 I2C 控制器硬件
        ↓
各自专用的 I2C 控制器驱动
        ↓
统一注册成 i2c_adapter
        ↓
Linux I2C core 用统一方式管理
```

例如：

```text
SG2002 I2C 控制器  → sophgo_i2c_driver → i2c_adapter
RK3588 I2C 控制器  → rk3x_i2c_driver   → i2c_adapter
STM32 I2C 控制器   → stm32_i2c_driver  → i2c_adapter
Zynq I2C 控制器    → cdns_i2c_driver   → i2c_adapter
```

这和网卡有点像：

```text
不同品牌网卡硬件
        ↓
不同网卡驱动
        ↓
统一注册成 eth0 / wlan0
```

I2C 这里则是：

```text
不同 I2C 控制器硬件
        ↓
不同 I2C 控制器驱动
        ↓
统一注册成 i2c_adapter / i2c-X
```

---

## 7. I2C 控制器驱动要提供什么统一接口？

I2C 控制器驱动最核心要提供一个结构：

```c
struct i2c_algorithm
```

它描述：

> 这个 I2C 控制器到底怎么完成一次传输？

其中最重要的是 `master_xfer()`：

```c
int master_xfer(struct i2c_adapter *adap,
                struct i2c_msg *msgs,
                int num);
```

它的意思是：

> 请你用这个 I2C 控制器，在总线上完成 num 个 i2c_msg 传输。

比如读取一个 sensor 寄存器，可能需要两个 message：

```text
msg[0]: 写设备地址 0x29，发送寄存器地址
msg[1]: 读设备地址 0x29，读取寄存器数据
```

上层只需要构造统一格式的 `i2c_msg`，然后调用 I2C core。

真正到了底层，具体 SoC 驱动会在 `master_xfer()` 里面完成：

```text
配置目标地址
配置读写方向
写 TX FIFO
启动传输
等待中断或轮询完成
检查 ACK/NACK
读取 RX FIFO
返回传输结果
```

除了 `master_xfer()`，还有一个常见接口是 `functionality()`：

```c
u32 functionality(struct i2c_adapter *adap);
```

它用于告诉 Linux：

```text
这个 I2C 控制器支持哪些能力？
```

比如：

```c
I2C_FUNC_I2C |
I2C_FUNC_SMBUS_BYTE |
I2C_FUNC_SMBUS_BYTE_DATA |
I2C_FUNC_SMBUS_WORD_DATA
```

可以理解为：

```text
支持普通 I2C 传输
支持 SMBus byte 访问
支持 SMBus byte data 访问
支持 SMBus word data 访问
```

所以 I2C 控制器驱动向上提供的核心统一接口可以概括为：

```text
i2c_adapter
    └── i2c_algorithm
            ├── master_xfer()
            ├── functionality()
            └── smbus_xfer() 可选
```

---

## 8. `/dev` 下面的东西是什么？

`/dev` 下面主要是用户态访问内核设备或伪设备的入口，但不全都是字符设备。

大致可以分成几类：

```text
/dev/xxx
├── 字符设备 char device
├── 块设备 block device
└── 符号链接、目录、socket 等辅助项
```

常见字符设备：

```text
/dev/ttyS0        串口
/dev/ttyUSB0      USB 转串口
/dev/i2c-4        I2C bus 4
/dev/spidev0.0    SPI 设备
/dev/video0       摄像头/V4L2 设备
/dev/input/event0 输入设备
/dev/null         空设备
/dev/random       随机数设备
```

常见块设备：

```text
/dev/sda          磁盘
/dev/sda1         分区
/dev/nvme0n1      NVMe 硬盘
/dev/mmcblk0      eMMC / SD 卡
```

`/dev` 的核心意义是：

> 让用户态程序通过统一的文件接口访问内核驱动暴露出来的资源。

很多设备都可以用类似文件的方式操作：

```c
open()
read()
write()
ioctl()
close()
```

比如：

```text
串口         → /dev/ttyUSB0
摄像头       → /dev/video0
I2C 总线     → /dev/i2c-4
硬盘分区      → /dev/sda1
```

但是要注意：

> `/dev` 不是完整的硬件列表，而是“用户态可操作入口”。

更完整的设备模型和驱动绑定关系，通常要看：

```bash
/sys/bus/
/sys/class/
/sys/devices/
```

---

## 9. 总结

Linux 对 SoC I2C 控制器的抽象链路可以简化成：

```text
SoC 内部 I2C 控制器
        ↓
DTS 描述它的地址、中断、时钟、compatible
        ↓
Linux 创建 platform_device
        ↓
匹配对应的 I2C 控制器驱动
        ↓
驱动 probe()
        ↓
注册 i2c_adapter
        ↓
i2c-dev 暴露成 /dev/i2c-X
        ↓
用户态程序可以访问这条 I2C 总线
```

其中最关键的几个概念是：

```text
DTS:
    描述硬件有什么、在哪、怎么连接

platform_device:
    Linux 根据设备树创建出来的设备对象

platform_driver:
    真正接管这个控制器的内核驱动

i2c_adapter:
    Linux I2C 子系统里对“一条 I2C 总线”的抽象

i2c_client:
    挂在这条 I2C 总线上的某个具体外设

/dev/i2c-X:
    用户态访问这条 I2C 总线的字符设备入口
```

所以：

> DTS 只是告诉 Linux “这里有硬件”，驱动才真正让硬件工作；I2C 控制器驱动把不同 SoC 的底层寄存器差异封装起来，最终统一注册成 `i2c_adapter`，这样 Linux 上层才能用统一模型访问 I2C 外设。
